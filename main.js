const { program } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Налаштування параметрів командного рядка
program
  .requiredOption('-H, --host <address>', 'Адреса сервера')
  .requiredOption('-p, --port <number>', 'Порт сервера')
  .requiredOption('-c, --cache <path>', 'Шлях до директорії з кешем');

program.parse(process.argv);

const options = program.opts();

// Логіка перевірки та створення директорії кешу
const cachePath = path.resolve(options.cache);

if (!fs.existsSync(cachePath)) {
  try {
    fs.mkdirSync(cachePath, { recursive: true });
    console.log(`Created cache directory at: ${cachePath}`);
  } catch (err) {
    console.error(`Error creating cache directory: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log(`Using existing cache directory: ${cachePath}`);
}

// Створення та запуск веб-сервера
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Server is running!');
});

server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
});