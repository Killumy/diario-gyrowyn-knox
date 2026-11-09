# Il Diario di Gyrowyn Knox

Diario interattivo ambientato nel 1890, con il rito Revelio, pagine animate, illustrazioni, effetti sonori e colonna sonora. Il pacchetto contiene la versione 45 del sito.

## GitHub Pages

1. Estrai lo ZIP. Carica il contenuto estratto nel repository `diario-gyrowyn-knox`, mantenendo `index.html` nella radice e la cartella `assets` accanto a esso.
2. In **Settings → Pages**, seleziona **Deploy from a branch**, scegli `main` e `/(root)`, poi salva.
3. Apri l’indirizzo indicato in **Settings → Pages** dopo la pubblicazione.

[Guida GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Claude

Per usare il repository come contesto di un progetto Claude, apri **Project knowledge**, scegli **+ → GitHub** e seleziona il repository. Per lavorare sul codice con Claude Code, apri la cartella estratta oppure il clone del repository.

[Guida all’integrazione GitHub di Claude](https://support.claude.com/it/articles/10167454-usa-l-integrazione-github)

## Anteprima in locale

Esegui `python -m http.server 8000` nella cartella estratta e apri `http://localhost:8000/`. I font e la colonna sonora di YouTube richiedono una connessione a Internet. Le immagini e gli effetti audio locali sono nella cartella `assets`.
