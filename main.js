const { program } = require('commander');

program
  .version('1.0.0')
  .description('My Node.js CLI tool')
  .option('-n, --name <type>', 'specify the name')
  .action((options) => {
    console.log(`Hello, ${options.name || 'World'}!`);
  });

program.parse(process.argv);