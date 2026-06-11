const fs = require('fs');
const path = require('path');

const win1252ToUnicode={0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02DC,0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178};
const unicodeToWin1252={};
for(let i=0;i<256;i++){if(win1252ToUnicode[i])unicodeToWin1252[win1252ToUnicode[i]]=i;else unicodeToWin1252[i]=i;}
const chars=[];
for(let i=0x80;i<=0xFF;i++){chars.push(String.fromCharCode(win1252ToUnicode[i]||i));}
const regex=new RegExp('['+chars.join('').replace(/[-[\]{}()*+?.,\\\\^$|#\s]/g, '\\\\$&')+']{2,}','g');

function fixMojibake(str) {
  let changed = false;
  const fixed = str.replace(regex, m => {
    const b=[];
    for(let i=0;i<m.length;i++)b.push(unicodeToWin1252[m.charCodeAt(i)]);
    const d=Buffer.from(b).toString('utf8');
    if (d.includes('\uFFFD')) return m;
    changed = true;
    return d;
  });
  return { fixed, changed };
}

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!p.includes('node_modules') && !p.includes('.git')) walk(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      const txt = fs.readFileSync(p, 'utf8');
      const { fixed, changed } = fixMojibake(txt);
      if (changed) {
        fs.writeFileSync(p, fixed, 'utf8');
        console.log('Fixed:', p);
      }
    }
  });
}

walk('src');
