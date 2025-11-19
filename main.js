const { program } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const { URL } = require('url');
const querystring = require('querystring');

// --- Налаштування Commander ---
program
  .requiredOption('-H, --host <address>', 'Адреса сервера')
  .requiredOption('-p, --port <number>', 'Порт сервера')
  .requiredOption('-c, --cache <path>', 'Шлях до директорії з кешем');

program.parse(process.argv);
const options = program.opts();

// --- Підготовка кешу та БД ---
const cachePath = path.resolve(options.cache);
if (!fs.existsSync(cachePath)) {
  fs.mkdirSync(cachePath, { recursive: true });
}
const dbFile = path.join(cachePath, 'inventory.json');

// --- Функції роботи з "БД" ---
function readDb() {
  if (!fs.existsSync(dbFile)) return [];
  const data = fs.readFileSync(dbFile, 'utf8');
  return data ? JSON.parse(data) : [];
}

function writeDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// --- Сервер ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`Request: ${req.method} ${pathname}`);

  // Віддача HTML файлу реєстрації
  if (pathname === '/RegisterForm.html' && req.method === 'GET') {
    const formPath = path.join(__dirname, 'RegisterForm.html');
    if (fs.existsSync(formPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(formPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('RegisterForm.html not found');
    }
    return;
  }

  // Віддача HTML файлу пошуку
  if (pathname === '/SearchForm.html' && req.method === 'GET') {
    const formPath = path.join(__dirname, 'SearchForm.html');
    if (fs.existsSync(formPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(formPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('SearchForm.html not found');
    }
    return;
  }

  // Обробка реєстрації (POST /register)
  if (pathname === '/register' && req.method === 'POST') {
    const form = new formidable.IncomingForm();
    form.uploadDir = cachePath;
    form.keepExtensions = true;

    form.parse(req, (err, fields, files) => {
      if (err) {
        res.writeHead(500);
        res.end('Error parsing form data');
        return;
      }

      // formidable повертає масиви, беремо перше значення
      const name = Array.isArray(fields.inventory_name) ? fields.inventory_name[0] : fields.inventory_name;
      const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
      const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

      if (!name) {
        res.writeHead(400);
        res.end('Bad Request: Name is required');
        return;
      }

      const items = readDb();
      const newItem = {
        id: Date.now().toString(),
        name: name,
        description: description || '',
        photo: photoFile ? path.basename(photoFile.filepath) : null
      };

      items.push(newItem);
      writeDb(items);

      res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Created! ID: ${newItem.id}`);
    });
    return;
  }

  // Обробка пошуку (POST /search)
  if (pathname === '/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      // Парсимо x-www-form-urlencoded
      const parsedBody = querystring.parse(body);
      
      // У вашій формі поля називаються 'id' та 'includePhoto'
      const searchId = parsedBody.id;
      const includePhoto = parsedBody.includePhoto === 'on'; // Чекбокс повертає 'on', якщо вибраний

      const items = readDb();
      const item = items.find(i => i.id === searchId);

      if (item) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        
        // Копіюємо об'єкт, щоб не змінювати оригінал в БД
        const responseData = { ...item };
        
        // Якщо галочка була натиснута, додаємо посилання на фото
        if (includePhoto && item.photo) {
          responseData.photoUrl = `/inventory/${item.id}/photo`;
        }
        
        res.end(JSON.stringify(responseData));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Item not found');
      }
    });
    return;
  }

  // GET photo (/inventory/:id/photo)
  const photoMatch = pathname.match(/^\/inventory\/(\w+)\/photo$/);
  if (photoMatch && req.method === 'GET') {
    const id = photoMatch[1];
    const items = readDb();
    const item = items.find(i => i.id === id);

    if (item && item.photo) {
      const photoPath = path.join(cachePath, item.photo);
      if (fs.existsSync(photoPath)) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        fs.createReadStream(photoPath).pipe(res);
        return;
      }
    }
    res.writeHead(404);
    res.end('Photo not found');
    return;
  }
  
  // GET /inventory
  if (pathname === '/inventory' && req.method === 'GET') {
      const items = readDb();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(items));
      return;
  }

  // Якщо маршрут не знайдено
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
});