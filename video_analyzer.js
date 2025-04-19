const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Цвета ANSI
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    magenta: "\x1b[35m"
};

// Поддерживаемые форматы
const supportedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

/** Получение всех подкаталогов рекурсивно */
const getAllSubdirectories = async (dir, relativeTo = dir) => {
    let results = [];

    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            const fullPath = path.join(dir, file.name);
            const relativePath = path.relative(relativeTo, fullPath);
            results.push(relativePath);
            const subDirs = await getAllSubdirectories(fullPath, relativeTo);
            results.push(...subDirs);
        }
    }

    return results;
};

/** Получение всех видеофайлов в указанной папке */
const getVideoFiles = async (dir) => {
    const files = await fs.readdir(dir);
    return files.filter((file) =>
        supportedExtensions.includes(path.extname(file).toLowerCase())
    );
};

/** Получение длительности файла через ffmpeg */
const getDuration = async (file) => {
    try {
        const { stdout } = await execPromise(`ffmpeg -i '${file}' 2>&1 | grep "Duration"`);
        const match = stdout.match(/Duration: (\d+):(\d+):(\d+)/);
        if (match) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const seconds = parseInt(match[3]);
            return hours * 3600 + minutes * 60 + seconds;
        } else {
            throw new Error(`Не удалось распарсить длительность файла ${file}`);
        }
    } catch (error) {
        console.error(`${colors.red}Ошибка при получении длительности файла ${file}: ${error.message}${colors.reset}`);
        return 0;
    }
};

const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h} ч ${m} мин ${s} сек`;
};

const saveCSV = (rows) => {
    const header = 'Каталог,Количество файлов,Общая длительность (сек),Форматированная длительность';
    const lines = rows.map(row =>
        `"${row.name}",${row.count},${row.duration},${row.formatted}`
    );
    const csvContent = [header, ...lines].join('\n');
    fsSync.writeFileSync('video_stats.csv', csvContent, 'utf8');
    console.log(`${colors.green}📄 Файл статистики CSV сохранён: video_stats.csv${colors.reset}`);
};

/** Создание HTML-отчёта */
const saveHTML = (rows, totalDuration, folderData) => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `video_stats_${timestamp}.html`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Отчёт по видеофайлам</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    h1 {
      color: #333;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background-color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #4CAF50;
      color: white;
    }
    tr:hover {
      background-color: #f1f1f1;
    }
    .folder {
      cursor: pointer;
      color: #2b6cb0;
      text-decoration: underline;
    }
    .folder:hover {
      color: #1a4971;
    }
    .sub-content {
      display: none;
      padding-left: 20px;
      margin: 10px 0;
      background-color: #fafafa;
      border-left: 3px solid #4CAF50;
    }
    .sub-content.show {
      display: block;
    }
    .sub-content ul {
      list-style-type: none;
      padding: 0;
    }
    .sub-content li {
      padding: 5px 0;
    }
    .sub-content .folder {
      font-weight: bold;
    }
    .sub-content .file {
      color: #555;
    }
    .total {
      font-weight: bold;
      margin-top: 20px;
      font-size: 1.2em;
      color: #333;
      text-align: center;
    }
    footer {
      text-align: center;
      margin-top: 20px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Отчёт по видеофайлам</h1>
  <table>
    <thead>
      <tr>
        <th>Каталог</th>
        <th>Количество файлов</th>
        <th>Общая длительность (сек)</th>
        <th>Форматированная длительность</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td><span class="folder" data-folder="${row.name}">${row.name}</span></td>
          <td>${row.count}</td>
          <td>${row.duration}</td>
          <td>${row.formatted}</td>
        </tr>
        <tr>
          <td colspan="4">
            <div class="sub-content" id="sub-${row.name.replace(/[^a-zA-Z0-9]/g, '_')}">
              <ul>
                ${folderData[row.name]?.files.map(file => `
                  <li class="file">${file.name} (${formatDuration(file.duration)})</li>
                `).join('') || ''}
                ${folderData[row.name]?.subfolders.map(subfolder => `
                  <li><span class="folder" data-folder="${subfolder}">${subfolder}</span></li>
                `).join('') || ''}
              </ul>
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="total">Общая длительность всех видеофайлов: ${formatDuration(totalDuration)}</div>
  <footer>Отчёт создан: ${now.toLocaleString('ru-RU')}</footer>

  <script>
    document.querySelectorAll('.folder').forEach(folder => {
      folder.addEventListener('click', () => {
        const folderName = folder.getAttribute('data-folder').replace(/[^a-zA-Z0-9]/g, '_');
        const subContent = document.getElementById('sub-' + folderName);
        if (subContent) {
          subContent.classList.toggle('show');
        }
      });
    });
  </script>
</body>
</html>
  `;

    fsSync.writeFileSync(filename, htmlContent, 'utf8');
    console.log(`${colors.green}🌐 HTML-отчёт сохранён: ${filename}${colors.reset}`);
};

const main = async () => {
    const rootDir = process.cwd();
    const allDirs = await getAllSubdirectories(rootDir);
    allDirs.unshift('.'); // добавить корневую папку тоже

    let totalDuration = 0;
    const csvRows = [];
    const folderData = {};

    console.log(`${colors.cyan}🎬 Анализ видеофайлов во всех подкаталогах (рекурсивно):${colors.reset}`);

    for (const relativeDir of allDirs) {
        const absoluteDir = path.join(rootDir, relativeDir);
        const videoFiles = await getVideoFiles(absoluteDir);

        folderData[relativeDir] = { files: [], subfolders: [] };

        if (videoFiles.length === 0) {
            console.log(`${colors.yellow}📂 Каталог "${relativeDir}" не содержит видеофайлов.${colors.reset}`);
            // Собираем подкаталоги с видеофайлами
            const subDirs = await getAllSubdirectories(absoluteDir, rootDir);
            for (const subDir of subDirs) {
                const subDirPath = path.join(rootDir, subDir);
                const subDirFiles = await getVideoFiles(subDirPath);
                if (subDirFiles.length > 0) {
                    folderData[relativeDir].subfolders.push(subDir);
                }
            }
            if (folderData[relativeDir].subfolders.length === 0) {
                delete folderData[relativeDir];
            }
            continue;
        }

        let dirDuration = 0;
        for (const videoFile of videoFiles) {
            const filePath = path.join(absoluteDir, videoFile);
            const duration = await getDuration(filePath);
            dirDuration += duration;
            folderData[relativeDir].files.push({ name: videoFile, duration });
        }

        // Собираем подкаталоги с видеофайлами
        const subDirs = await getAllSubdirectories(absoluteDir, rootDir);
        for (const subDir of subDirs) {
            const subDirPath = path.join(rootDir, subDir);
            const subDirFiles = await getVideoFiles(subDirPath);
            if (subDirFiles.length > 0) {
                folderData[relativeDir].subfolders.push(subDir);
            }
        }

        totalDuration += dirDuration;

        console.log(`${colors.magenta}📁 Каталог: ${relativeDir}${colors.reset}`);
        console.log(`${colors.green}▶️ Найдено файлов: ${videoFiles.length}${colors.reset}`);
        console.log(`${colors.cyan}⏱️ Общая длительность: ${formatDuration(dirDuration)}${colors.reset}`);
        console.log(`${colors.reset}---`);

        csvRows.push({
            name: relativeDir,
            count: videoFiles.length,
            duration: dirDuration,
            formatted: formatDuration(dirDuration)
        });
    }

    console.log(`${colors.yellow}🎉 Общая длительность всех видеофайлов: ${colors.green}${formatDuration(totalDuration)}${colors.reset}`);
    saveCSV(csvRows);
    saveHTML(csvRows, totalDuration, folderData);
};

main();