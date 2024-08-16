const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Inicializa o aplicativo Express
const app = express();

const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 3000;

// Configuração do middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/pages')));

// Conectar ao MongoDB Atlas
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado ao MongoDB Atlas com sucesso'))
  .catch(err => console.error('Erro de conexão com o MongoDB:', err));

// Definir o modelo Mongoose para Processos
const processoSchema = new mongoose.Schema({
  titulo: String,
  descricao: String,
  periodo: String,
  url: String,
  edital: String
});

const Processo = mongoose.model('Processo', processoSchema);

// Rota para iniciar o scraping e atualizar o banco de dados
app.get('/scrape', async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      executablePath:
        process.env.NODE_ENV === "production"
          ? process.env.PUPPETEER_EXECUTABLE_PATH
          : puppeteer.executablePath(),
    });

    const page = await browser.newPage();
    const url = 'https://selecao-login.app.ufgd.edu.br/';
    
    await page.goto(url, { waitUntil: 'networkidle2' });

    const processos = await page.evaluate(() => {
      const processos = [];
      const rows = document.querySelectorAll('tr[ng-repeat="processo in ctrl.inscricoesAbertas track by $index"]');
      
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        const titulo = cells[0].innerText.trim();
        const descricao = cells[1].innerText.trim().replace('Mostrar mais', '').trim();
        const periodo = cells[2].innerText.trim();
        const editalUrl = cells[3].querySelector('a') ? cells[3].querySelector('a').href : '';
        const paginaUrl = cells[4].querySelector('a') ? cells[4].querySelector('a').href : '';

        if (!titulo.startsWith('PSIE')) {
          processos.push({
            titulo: titulo,
            descricao: descricao,
            periodo: periodo,
            url: paginaUrl,
            edital: editalUrl
          });
        }
      });

      return processos;
    });

    await Processo.deleteMany({});
    await Processo.insertMany(processos);

    res.json({ processos });
  } catch (error) {
    console.error('Erro ao acessar a página de scraping:', error.message);
    res.status(500).send('Erro ao acessar a página de scraping');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Rota para atualizar os dados no banco de dados
app.post('/atualizar', async (req, res) => {
  try {
    const { processosAtualizados } = req.body;

    if (!Array.isArray(processosAtualizados)) {
      return res.status(400).send('Dados inválidos.');
    }

    await Processo.deleteMany({});
    await Processo.insertMany(processosAtualizados);

    res.send('Dados atualizados com sucesso!');
  } catch (error) {
    console.error('Erro ao atualizar os dados na API:', error.message);
    res.status(500).send('Erro ao atualizar os dados na API');
  }
});

// Rota para obter processos abertos
app.get('/processosAbertos', async (req, res) => {
  try {
    const processos = await Processo.find({});
    res.json(processos);
  } catch (error) {
    console.error('Erro ao buscar processos atualizados:', error.message);
    res.status(500).send('Erro ao buscar processos atualizados');
  }
});

// Rota para servir o arquivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/pages', 'index.html'));
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
