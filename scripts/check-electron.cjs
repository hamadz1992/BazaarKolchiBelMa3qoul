const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');
const electronDir=path.dirname(require.resolve('electron/package.json',{paths:[root]}));
const exe=path.join(electronDir,'dist','electron.exe');
console.log('[electron:check] binary:',exe);
console.log(fs.existsSync(exe)?'Electron binary OK':'Electron binary MISSING');
process.exit(fs.existsSync(exe)?0:1);
