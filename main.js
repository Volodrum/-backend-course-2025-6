const { program } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const { URL } = require('url');
const querystring = require('querystring');
const swaggerJsdoc = require('swagger-jsdoc');

// --- 1. Налаштування Commander ---
program
  .requiredOption('-H, --host <address>', 'Адреса сервера')
  .requiredOption('-p, --port <number>', 'Порт сервера')
  .requiredOption('-c, --cache <path>', 'Шлях до директорії з кешем');

program.parse(process.argv);
const options = program.opts();

// --- 2. Підготовка кешу ---
const cachePath = path.resolve(options.cache);
if (!fs.existsSync(cachePath)) {
  fs.mkdirSync(cachePath, { recursive: true });
}
const dbFile = path.join(cachePath, 'inventory.json');

// --- 3. База даних ---
function readDb() {
  if (!fs.existsSync(dbFile)) return [];
  const data = fs.readFileSync(dbFile, 'utf8');
  return data ? JSON.parse(data) : [];
}

function writeDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// --- 4. Налаштування Swagger (JavaScript Об'єкт замість коментарів) ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Inventory API',
    version: '1.0.0',
    description: 'API для управління інвентаризацією',
  },
  servers: [
    { url: `http://${options.host}:${options.port}` }
  ],
  paths: {
    '/inventory': {
      get: {
        summary: 'Отримати список всіх речей',
        responses: {
          200: {
            description: 'Список речей успішно отримано'
          }
        }
      }
    },
    '/register': {
      post: {
        summary: 'Реєстрація нової речі (з фото)',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  inventory_name: { type: 'string' },
                  description: { type: 'string' },
                  photo: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Річ створено' }
        }
      }
    },
    '/search': {
      post: {
        summary: 'Пошук речі за ID',
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  includePhoto: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Річ знайдено' },
          404: { description: 'Річ не знайдено' }
        }
      }
    },
    '/inventory/{id}': {
      get: {
        summary: 'Отримати деталі речі за ID',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Деталі речі' }
        }
      },
      put: {
        summary: 'Оновити назву або опис речі',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Оновлено успішно' }
        }
      },
      delete: {
        summary: 'Видалити річ',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Видалено' }
        }
      }
    },
    '/inventory/{id}/photo': {
      get: {
        summary: 'Отримати фото речі',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Зображення (image/jpeg)' }
        }
      }
    }
  }
};

// Ми передаємо об'єкт безпосередньо, не використовуючи apis: []
const swaggerOptions = {
  definition: swaggerDocument,
  apis: [], // Не шукаємо коментарі
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// HTML шаблон для Swagger UI
const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Inventory API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/swagger.json',
        dom_id: '#swagger-ui',
      });
    };
  </script>
</body>
</html>
`;

// --- 5. Сервер ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  console.log(`Request: ${req.method} ${pathname}`);

  // --- SWAGGER ROUTES ---
  if (pathname === '/docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(swaggerHtml);
    return;
  }

  if (pathname === '/swagger.json' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(swaggerSpec));
    return;
  }

  // --- STATIC FILES ---
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

  // --- API LOGIC ---
  
  // GET /inventory
  if (pathname === '/inventory' && req.method === 'GET') {
    const items = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(items));
    return;
  }

  // POST /register
  if (pathname === '/register' && req.method === 'POST') {
    const form = new formidable.IncomingForm();
    form.uploadDir = cachePath;
    form.keepExtensions = true;

    form.parse(req, (err, fields, files) => {
      if (err) {
        res.writeHead(500); res.end('Error'); return;
      }
      const name = Array.isArray(fields.inventory_name) ? fields.inventory_name[0] : fields.inventory_name;
      const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
      const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

      if (!name) {
        res.writeHead(400); res.end('Bad Request'); return;
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
      res.writeHead(201, { 'Content-Type': 'text/plain' });
      res.end(`Created! ID: ${newItem.id}`);
    });
    return;
  }

  // POST /search
  if (pathname === '/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const parsedBody = querystring.parse(body);
      const searchId = parsedBody.id;
      const includePhoto = parsedBody.includePhoto === 'on';

      const items = readDb();
      const item = items.find(i => i.id === searchId);

      if (item) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const responseData = { ...item };
        if (includePhoto && item.photo) {
          responseData.photoUrl = `/inventory/${item.id}/photo`;
        }
        res.end(JSON.stringify(responseData));
      } else {
        res.writeHead(404); res.end('Not Found');
      }
    });
    return;
  }

  // ID routes
  const idMatch = pathname.match(/^\/inventory\/(\w+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const items = readDb();
    const itemIndex = items.findIndex(i => i.id === id);

    if (itemIndex === -1) {
      res.writeHead(404); res.end('Not Found'); return;
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(items[itemIndex]));
      return;
    } else if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const updates = JSON.parse(body);
          if (updates.name) items[itemIndex].name = updates.name;
          if (updates.description) items[itemIndex].description = updates.description;
          writeDb(items);
          res.writeHead(200); res.end('Updated');
        } catch (e) {
          res.writeHead(400); res.end('Invalid JSON');
        }
      });
      return;
    } else if (req.method === 'DELETE') {
      if (items[itemIndex].photo) {
         try { fs.unlinkSync(path.join(cachePath, items[itemIndex].photo)); } catch(e){}
      }
      items.splice(itemIndex, 1);
      writeDb(items);
      res.writeHead(200); res.end('Deleted');
      return;
    }
  }

  // Photo route
  const photoMatch = pathname.match(/^\/inventory\/(\w+)\/photo$/);
  if (photoMatch) {
     const id = photoMatch[1];
     const items = readDb();
     const item = items.find(i => i.id === id);
     if (req.method === 'GET') {
        if (item && item.photo) {
            const photoPath = path.join(cachePath, item.photo);
            if(fs.existsSync(photoPath)) {
                res.writeHead(200, {'Content-Type': 'image/jpeg'});
                fs.createReadStream(photoPath).pipe(res);
                return;
            }
        }
        res.writeHead(404); res.end('No photo');
        return;
     }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}`);
  console.log(`Docs available at http://${options.host}:${options.port}/docs`);
});