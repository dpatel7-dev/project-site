// hey's know-how: plain words to a Linux command, what each part does, and how risky it is.
// Works with no AI at all for the everyday things; Deuce's brain (if it's set up) takes the rest, and the
// risk is always decided here, whatever the AI says. Used by js/apps/hey.js, and tested in test/hey.test.js.
(function (root) {
  'use strict';
  const PLACES = { downloads: '~/Downloads', download: '~/Downloads', desktop: '~/Desktop', documents: '~/Documents', docs: '~/Documents', pictures: '~/Pictures', photos: '~/Pictures', music: '~/Music', videos: '~/Videos', home: '~', 'this folder': '.', here: '.', 'the trash': '~/.local/share/Trash/files' };
  const placeIn = (t) => { const m = /\b(?:in|from|inside|under|on|of) (?:my |the )?(downloads?|desktop|documents|docs|pictures|photos|music|videos|home(?: folder)?|this folder|here)\b/.exec(t) || /\b(downloads?|desktop|documents|pictures|music|videos)\b/.exec(t); return m ? PLACES[m[1].replace(/^home folder$/, 'home')] || '~' : null; };
  const sizeIn = (t) => { const m = /(\d+(?:\.\d+)?)\s*(k|kb|m|mb|meg|g|gb|gig)s?\b/.exec(t); if (m) return '+' + Math.round(+m[1]) + ({ k: 'k', kb: 'k', m: 'M', mb: 'M', meg: 'M', g: 'G', gb: 'G', gig: 'G' })[m[2]]; return /\b(huge|biggest|largest)\b/.test(t) ? '+500M' : '+100M'; };
  const q = (s) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'");
  const word = (t, re) => { const m = re.exec(t); return m ? m[1].trim() : null; };

  // the recipes: [what it understands, the command]
  const R = [
    [/\b(big|large|huge|biggest|largest)\b.*\bfiles?\b|\bfiles?\b.*\b(bigger|larger|over|more) than\b/, (t) => 'find ' + (placeIn(t) || '~') + ' -type f -size ' + sizeIn(t) + ' -exec ls -lh {} + | sort -k5 -h -r | head -20'],
    [/\b(what|which) (folders?|things?) (is|are) (taking|using) (up )?(the most )?(space|room)|\bdisk (space|usage)\b.*\bfolders?\b|\bbiggest folders?\b|\b(taking|using) up (the most |all the |so much )?(space|room)\b/, (t) => 'du -sh ' + (placeIn(t) || '~') + '/* 2>/dev/null | sort -h -r | head -15'],
    [/\b(how much|free|left|remaining) (disk |storage )?(space|room|storage)\b|\bdisk space\b|\bis my (disk|drive|card) full\b/, () => 'df -h /'],
    [/\b(find|search for|look for|where is|where are|locate)\b.*\b(called|named)\b/, (t) => 'find ' + (placeIn(t) || '~') + ' -iname ' + q('*' + (word(t, /\b(?:called|named) ["']?([^"']+?)["']?(?: in | on |$)/) || 'name') + '*')],
    [/\b(find|search|look for|grep)\b.*\b(word|text|says|containing|contains|mention)/, (t) => 'grep -rniI ' + q(word(t, /\b(?:word|text|says|containing|contains|mentions?)\s+["']?([^"']+?)["']?(?: in | inside |$)/) || 'something') + ' ' + (placeIn(t) || '.')],
    [/\b(find|show|list)\b.*\b(pdfs?|photos?|pictures?|images?|videos?|songs?|mp3s?|zips?|documents?)\b/, (t) => { const k = /pdf/.test(t) ? '*.pdf' : /photo|picture|image/.test(t) ? '*.jpg' : /video/.test(t) ? '*.mp4' : /song|mp3/.test(t) ? '*.mp3' : /zip/.test(t) ? '*.zip' : '*.docx'; return 'find ' + (placeIn(t) || '~') + ' -type f -iname ' + q(k); }],
    [/\b(new|recent|latest|last) (files?|downloads?)\b|\bfiles? (from|changed|made) (today|this week)\b/, (t) => 'find ' + (placeIn(t) || '~') + ' -type f -mtime ' + (/week/.test(t) ? '-7' : '-1') + ' -not -path "*/.*" | head -30'],
    [/\b(list|show|what'?s in|whats in)\b.*\b(folder|directory|files)\b|^(ls|list files)$/, (t) => 'ls -lah ' + (placeIn(t) || '.')],
    [/\b(make|create|new) (a )?(folder|directory)\b/, (t) => 'mkdir -p ' + (placeIn(t) ? placeIn(t) + '/' : '') + q(word(t, /\b(?:called|named) ["']?([^"']+?)["']?(?: in | on |$)/) || 'new-folder')],
    [/\b(delete|remove|erase|get rid of)\b.*\b(empty folders?)\b/, (t) => 'find ' + (placeIn(t) || '.') + ' -type d -empty -delete'],
    [/\b(delete|remove|erase|get rid of)\b/, (t) => 'rm -i ' + q(word(t, /\b(?:delete|remove|erase|get rid of) (?:the )?(?:file )?["']?([^"']+?)["']?(?: from | in |$)/) || 'file')],
    [/\b(move|put)\b.*\bto\b/, (t) => { const m = /\b(?:move|put) (?:the |all (?:the )?|my )?["']?(.+?)["']? (?:in(?:to)?|to) (?:my |the )?["']?(.+?)["']?$/.exec(t); const to = m && (PLACES[m[2]] || m[2]); const what = m ? (/^(pdfs?|photos?|pictures?)$/.test(m[1]) ? (/pdf/.test(m[1]) ? '*.pdf' : '*.jpg') : m[1]) : 'file'; return 'mv -i ' + (what.includes('*') ? what : q(what)) + ' ' + q(to || '~/Documents') + '/'; }],
    [/\b(copy)\b.*\bto\b/, (t) => { const m = /\bcopy (?:the |my )?["']?(.+?)["']? (?:in(?:to)?|to) (?:my |the )?["']?(.+?)["']?$/.exec(t); return 'cp -r ' + q(m ? m[1] : 'file') + ' ' + q(m ? PLACES[m[2]] || m[2] : '~/Documents') + '/'; }],
    [/\b(rename)\b/, (t) => { const m = /\brename (?:the )?["']?(.+?)["']? (?:to|as) ["']?(.+?)["']?$/.exec(t); return 'mv -i ' + q(m ? m[1] : 'old-name') + ' ' + q(m ? m[2] : 'new-name'); }],
    [/\b(unzip|extract|open)\b.*\b(zip)\b/, (t) => 'unzip ' + q(word(t, /\b(\S+\.zip)\b/) || 'file.zip') + ' -d ' + q((word(t, /\b(\S+)\.zip\b/) || 'unzipped'))],
    [/\b(zip|compress)\b/, (t) => { const n = word(t, /\b(?:zip|compress) (?:up )?(?:the |my )?(?:folder )?["']?([^"']+?)["']?$/) || 'folder'; return 'zip -r ' + q(n.replace(/\/$/, '') + '.zip') + ' ' + q(n); }],
    [/\b(my )?ip( address)?\b/, (t) => (/\b(public|outside|internet)\b/.test(t) ? 'curl -s https://ifconfig.me; echo' : 'hostname -I')],
    [/\b(internet|wi ?fi|network)\b.*\b(working|up|connected|ok)\b|\bam i online\b|\bping\b/, () => 'ping -c 4 1.1.1.1'],
    [/\b(what'?s|whats|what is|show|list)\b.*\b(running|open|using (the )?(cpu|memory|ram))\b|\b(slow|frozen|stuck)\b/, () => 'top -o %CPU -n 1 -b | head -20'],
    [/\b(memory|ram)\b/, () => 'free -h'],
    [/\b(temperature|how hot|cpu temp)\b/, () => 'vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp'],
    [/\b(stop|kill|close|quit|end)\b.*\b(app|program|process|it)\b/, (t) => 'pkill -f ' + q(word(t, /\b(?:stop|kill|close|quit|end) (?:the )?(?:app |program |process )?["']?(\w[\w .-]*?)["']?(?: app| program| process)?$/) || 'name')],
    [/\b(update|upgrade)\b.*\b(everything|system|computer|packages|apps)\b|^update$/, () => 'sudo apt update && sudo apt upgrade'],
    [/\binstall\b/, (t) => { const n = word(t, /\binstall (?:the )?(?:app |program )?["']?([\w.+-]+)["']?/) || 'name'; return /\b(python|pip) /.test(t) ? 'pip install ' + q(n) : 'sudo apt install ' + q(n); }],
    [/\b(uninstall|remove the app)\b/, (t) => 'sudo apt remove ' + q(word(t, /\b(?:uninstall|remove the app) ["']?([\w.+-]+)["']?/) || 'name')],
    [/\b(restart|reboot)\b/, () => 'sudo reboot'],
    [/\b(shut ?down|turn off|power off)\b/, () => 'sudo shutdown now'],
    [/\b(how long|uptime|been on)\b/, () => 'uptime -p'],
    [/\b(which|what) (version|linux|os)\b|\babout (this|my) (computer|system)\b/, () => 'cat /etc/os-release; uname -r'],
    [/\b(git)\b.*\b(status|changed)\b|\bwhat changed\b.*\bproject\b/, () => 'git status'],
    [/\bgit\b.*\b(save|commit)\b/, (t) => 'git add -A && git commit -m ' + q(word(t, /\b(?:saying|message|called) ["']?([^"']+?)["']?$/) || 'Save my work')],
    [/\b(undo|throw away|discard)\b.*\b(changes)\b/, () => 'git restore .'],
    [/\b(download)\b.*\bhttps?:\/\//, (t) => 'curl -LO ' + q(word(t, /(https?:\/\/\S+)/))],
    [/\b(count|how many)\b.*\bfiles\b/, (t) => 'find ' + (placeIn(t) || '.') + ' -type f | wc -l'],
    [/\b(line|lines)\b.*\b(count|how many)|\bhow many lines\b/, (t) => 'wc -l ' + q(word(t, /\b(?:in|of) ["']?(\S+)["']?$/) || 'file.txt')],
    [/\b(see|show|read|print|look at)\b.*\b(file|inside)\b/, (t) => 'less ' + q(word(t, /\b(?:file|inside) ["']?(\S+)["']?$/) || 'file.txt')],
    [/\b(edit|change)\b.*\b(file|text)\b/, (t) => 'nano ' + q(word(t, /\b(?:file) ["']?(\S+)["']?$/) || 'file.txt')],
    [/\b(where am i|current folder|which folder)\b/, () => 'pwd'],
    [/\b(clear|clean) (the )?(screen|terminal)\b/, () => 'clear'],
    [/\b(date|time|what day)\b/, () => 'date'],
    [/\b(permission|make it run|executable|can'?t run)\b/, (t) => 'chmod +x ' + q(word(t, /\b(\S+\.(?:sh|py))\b/) || 'script.sh')],
    [/\b(python)\b.*\brun\b|\brun\b.*\.py\b/, (t) => 'python3 ' + q(word(t, /\b(\S+\.py)\b/) || 'program.py')],
  ];

  // what each part means (for "explain" and for the parts list under every command)
  const PROG = { find: 'looks through folders for files', du: 'measures how much space folders take', df: 'shows how full the drives are', grep: 'finds lines that contain some text', ls: 'lists what\'s in a folder', mkdir: 'makes a folder', rm: 'deletes files (they skip the Trash)', mv: 'moves or renames', cp: 'copies', unzip: 'opens a zip file', zip: 'makes a zip file', curl: 'fetches something from the internet', hostname: 'this computer\'s name and addresses', ping: 'checks the internet answers', top: 'shows what\'s using the computer', free: 'shows memory', vcgencmd: 'asks the Raspberry Pi about itself', pkill: 'stops a program by name', sudo: 'does the rest as the administrator (asks for your password)', apt: 'installs and updates apps', pip: 'installs Python packages', reboot: 'restarts the computer', shutdown: 'turns the computer off', uptime: 'how long the computer has been on', cat: 'prints a file', uname: 'the Linux version', git: 'keeps the history of a project', wc: 'counts lines, words or files', less: 'shows a file a page at a time (q quits)', nano: 'a simple text editor (Ctrl + X leaves)', pwd: 'the folder you\'re in', clear: 'clears the screen', date: 'the date and time', chmod: 'changes who may read, write or run a file', python3: 'runs a Python program', sort: 'puts lines in order', head: 'keeps only the first lines', echo: 'prints some words', dd: 'copies raw disks byte by byte', mkfs: 'formats a drive (erases it)' };
  const FLAG = { '-type f': 'files only (not folders)', '-type d': 'folders only', '-exec ls -lh {} +': 'show each one with its size', '-iname': 'by name, any capitals', '-mtime -1': 'changed in the last day', '-mtime -7': 'changed in the last week', '-empty': 'only empty ones', '-delete': 'deletes what it found', '-sh': 'one total each, in KB, MB or GB', '-h': 'sizes people can read', '-r': 'biggest first', '-rniI': 'in every folder, any capitals, with line numbers, skipping binary files', '-lah': 'every file, with details and sizes', '-p': 'and any folders on the way', '-i': 'asks before replacing or deleting anything', '-c 4': 'four times', '-o %CPU': 'busiest first', '-n 1 -b': 'once, as text', '-f': 'match the whole command line', '-m': 'with this message', '-LO': 'follow redirects and keep the file\'s name', '-l': 'count lines', '+x': 'allow it to be run', '-d': 'into this folder', '-k5': 'by the fifth column (the size)', '-20': 'the first 20', '-15': 'the first 15', '-30': 'the first 30', '-s': 'quietly', '-I': 'its addresses', '-p ': 'nicely' };
  function parts(cmd) {
    const out = [];
    String(cmd).split(/\s*(\|\||&&|;|\|)\s*/).forEach((seg) => {
      if (seg === '|') return out.push(['|', 'sends the result into the next command']);
      if (seg === '&&') return out.push(['&&', 'then, if that worked']);
      if (seg === '||') return out.push(['||', 'or, if that didn\'t work']);
      if (seg === ';') return out.push([';', 'then']);
      const toks = seg.match(/'[^']*'|"[^"]*"|\S+/g) || [];
      let i = 0;
      if (toks[0] === 'sudo') { out.push(['sudo', PROG.sudo]); i = 1; }
      const prog = toks[i];
      if (!prog) return;
      out.push([prog + (toks[i + 1] && /^(update|upgrade|install|remove|status|add|commit|restore)$/.test(toks[i + 1]) ? ' ' + toks[i + 1] : ''), PROG[prog] || 'a command']);
      if (toks[i + 1] && /^(update|upgrade|install|remove|status|add|commit|restore)$/.test(toks[i + 1])) i++;
      for (let j = i + 1; j < toks.length; j++) {
        const t = toks[j], two = t + ' ' + (toks[j + 1] || '');
        const n = [5, 4, 3].find((k) => FLAG[toks.slice(j, j + k).join(' ')]);
        if (n) { const s = toks.slice(j, j + n).join(' '); out.push([s, FLAG[s]]); j += n - 1; } else if (FLAG[two]) { out.push([two, FLAG[two]]); j++; } else if (FLAG[t]) out.push([t, FLAG[t]]);
        else if (/^-/.test(t) && /^-size$|^-mtime$/.test(t)) { out.push([two, t === '-size' ? 'bigger than ' + toks[j + 1].slice(1) : 'changed in the last ' + toks[j + 1].slice(1) + ' days']); j++; }
        else if (/^[~./]/.test(t) || /\//.test(t)) out.push([t, t === '.' ? 'this folder' : t === '~' ? 'your home folder' : 'the place: ' + t]);
        else if (/^'.*'$|^".*"$/.test(t)) out.push([t, 'the words, exactly']);
        else if (/^2>\/dev\/null$/.test(t)) out.push([t, 'hide error messages']);
        else if (/^-/.test(t)) out.push([t, 'an option']);
      }
    });
    return out;
  }

  // how risky: decided here, never by an AI
  function risk(cmd) {
    const c = String(cmd).replace(/2>\/dev\/null/g, '');
    if (/\brm\b|\bsudo\b|\bdd\b|\bmkfs|\b(curl|wget)\b[^|]*\|\s*(sudo )?(ba|z)?sh\b|git (reset --hard|clean|push --force)|:\(\)\s*\{|>\s*\/dev\/(sd|nvme|mmc)|chmod -R 777 \/|\bshutdown\b|\breboot\b|-delete\b|\bpkill\b|\bkill\b/.test(c)) return 'risky';
    if (/\bmv\b|\bcp\b|\bmkdir\b|\b(apt|pip|npm) (install|remove)\b|\bchmod\b|\bchown\b|\bgit (commit|push|add|restore)\b|\bunzip\b|\bzip\b|\bcurl -L?O\b|>|\bnano\b/.test(c)) return 'careful';
    return 'safe';
  }
  const RISK_WORDS = { safe: 'Safe: it only looks, nothing changes.', careful: 'Careful: it changes something. You\'ll be asked first.', risky: 'Risky: it can delete or change things for good. Type yes to run it.' };

  // plain words in → { cmd, parts, risk, said } (or null: then ask the AI)
  function hey(said) {
    const t = String(said || '').toLowerCase().replace(/[?!.]+$/, '').replace(/^(hey,? |how (do|can) i |i want to |i need to |please |can you |show me how to )/, '').trim();
    if (!t) return null;
    if (/^explain |^what does .+ (do|mean)$/.test(t)) { const c = String(said).trim().replace(/^.*?(explain|what does)\s+/i, '').replace(/\s+(do|mean)\??$/i, ''); return { cmd: c, parts: parts(c), risk: risk(c), explain: true }; }
    for (const [re, make] of R) if (re.test(t)) { const cmd = make(t); return { cmd, parts: parts(cmd), risk: risk(cmd), said }; }
    return null;
  }
  const api = { hey, parts, risk, RISK_WORDS, PLACES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeyBrain = api;
})(this);
