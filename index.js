const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const DEFAULTS = {
    headless: false,
    slowMo: 30,
    vwWidth: 1600,
    vwHeight: 900,
    timeout: 1000 * 60, // 1 minuto
};

// Função para solicitar entrada do usuário no terminal
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Função de log para escrever mensagens em um arquivo txt
function logToFile(message) {
    // Em ambiente empacotado, process.cwd() aponta para o diretório de execução.
    const baseDir = process.pkg ? process.cwd() : __dirname;
    const logFilePath = path.join(baseDir, 'automation.log');
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFilePath, fullMessage, 'utf8');
}

// Função para aguardar a presença de um elemento via XPath
async function waitForXPathSelector(page, xpath, options = {}) {
    await page.waitForTimeout(1000);
    return await page.waitForXPath(xpath, options);
}

// Função para clicar em um elemento via XPath
async function clickXPath(page, xpath, options = {}) {
    await page.waitForTimeout(1000);
    const element = await waitForXPathSelector(page, xpath, options);
    if (element) {
        await element.click();
    } else {
        throw new Error(`Elemento não encontrado para o XPath: ${xpath}`);
    }
}

// Função para digitar em um elemento via XPath
async function typeXPath(page, xpath, text, options = {}) {
    await page.waitForTimeout(1000);
    const element = await waitForXPathSelector(page, xpath, options);
    if (element) {
        await element.type(text);
    } else {
        throw new Error(`Elemento não encontrado para o XPath: ${xpath}`);
    }
}

function formatUrl(rawInput) {
    // Remove espaços e barras extras
    let input = rawInput.trim().replace(/\/+$/, "");

    // Remove o protocolo, se existir
    input = input.replace(/^https?:\/\//i, "");

    // Se já contém o domínio fixo, extraia apenas o nome do cliente
    const dominioFixo = ".softcomshop.com.br";
    let client = input;
    if (input.toLowerCase().includes(dominioFixo)) {
        // Extrai tudo que estiver antes do domínio fixo
        client = input.split(dominioFixo)[0];
    }

    // Garante que não haja pontos ou espaços no final
    client = client.replace(/\.+$/, "").trim();

    // Retorna a URL formatada
    return `https://${client}${dominioFixo}`;
}

// Função para capturar as entradas do usuário
async function getUserInputs() {
    // Exemplo de uso:
    let inputUrl = await askQuestion("Informe a URL do cliente: ");
    if (!inputUrl.trim()) {
        console.error("URL inválida");
        process.exit(1);
    }

    // Formata a URL independente de como o usuário digitou
    inputUrl = formatUrl(inputUrl);

    const inputCliente = await askQuestion("Informe um cliente para ser utilizado na criação da nota: ");
    if (!inputCliente.trim()) {
        console.error("Cliente inválido");
        process.exit(1);
    }
    const input = await askQuestion("Digite a quantidade de notas que deseja gerar: ");
    const repetitions = parseInt(input);
    if (isNaN(repetitions) || repetitions < 1) {
        console.error("Valor inválido. Por favor, digite um número maior que zero.");
        process.exit(1);
    }
    return { inputUrl, inputCliente, repetitions };
}

// Função para inicializar o navegador com Puppeteer
async function initBrowser() {
    const browser = await puppeteer.launch({
        slowMo: DEFAULTS.slowMo,
        protocolTimeout: DEFAULTS.timeout,
        executablePath: puppeteer.executablePath(),
        headless: DEFAULTS.headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--window-size=${DEFAULTS.vwWidth},${DEFAULTS.vwHeight}`
        ],
        defaultViewport: {
            width: DEFAULTS.vwWidth,
            height: DEFAULTS.vwHeight,
        },
    });
    return browser;
}

// Função para realizar o login
async function doLogin(page, inputUrl) {
    try {
        await page.goto(`${inputUrl}/auth/login`);
        await page.waitForSelector('#login-email');
        await page.type('#login-email', "fabrica@softcomtecnologia.com.br");
        await page.waitForSelector('#login-senha');
        await page.type('#login-senha', "fab1478");
        await page.waitForSelector('#login-acessar');
        await page.click('#login-acessar');
    } catch (error) {
        logToFile(`Erro no login: ${error.message}`);
        console.error("Erro durante o login. Verifique o log para mais detalhes.");
        process.exit(1);
    }
}

// Função para executar uma iteração da automação
async function runIteration(page, inputUrl, inputCliente, iteration) {
    try {
        logToFile(`Iniciando iteração ${iteration}`);
        console.log(`Iniciando iteração ${iteration}`);

        await page.goto(`${inputUrl}/nfse/cadastro-avulsa`);
        await typeXPath(page, `(//input[@id='data_competencia'])[1]`, `01/03/2025`);
        await page.keyboard.press('Escape');
        await typeXPath(page, `(//input[@id='auto_cliente_id'])[1]`, inputCliente);
        await page.waitForTimeout(5000);
        await clickXPath(page, '//*[@id="div_auto_cliente_id"]/div/div[2]/ul/li/a');
        await clickXPath(page, "(//button[@id='btn-salvar'])[1]");
        await page.waitForTimeout(5000);
        await clickXPath(page, "(//a[@class='btn btn-danger delete-single'])[1]");
        await clickXPath(page, "(//button[normalize-space()='Sim, pode excluir!'])[1]");

        logToFile(`Iteração ${iteration} concluída com sucesso`);
        console.log(`Iteração ${iteration} concluída`);
    } catch (error) {
        logToFile(`Erro na iteração ${iteration}: ${error.message}`);
        console.error(`Erro na iteração ${iteration}: ${error.message}`);
    }
}

// Função para aguardar que o usuário pressione apenas ENTER para sair
async function waitForExit() {
    while (true) {
        const resposta = await askQuestion("Automação concluída. Pressione ENTER para sair: ");
        if (resposta.trim() === "") {
            break;
        }
    }
}

// Função principal que orquestra todo o fluxo
(async () => {
    const { inputUrl, inputCliente, repetitions } = await getUserInputs();

    const browser = await initBrowser();
    const [page] = await browser.pages();
    page.setDefaultTimeout(DEFAULTS.timeout);
    page.setDefaultNavigationTimeout(DEFAULTS.timeout);

    await doLogin(page, inputUrl);

    for (let i = 1; i <= repetitions; i++) {
        await runIteration(page, inputUrl, inputCliente, i);
    }

    await waitForExit();

    logToFile(`Automação concluída.`);
    await browser.close();
})();
