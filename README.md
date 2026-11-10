# Map your data

Grafici e fit di dati sperimentali sul piano cartesiano, statistica di misure ripetute e mappatura di campi scalari e vettoriali.

## Grafico

- **Punti o vettori** inseriti cliccando sul piano (i vettori si disegnano trascinando) o compilando la tabella; si spostano trascinandoli
- **Più serie** di dati, ognuna con nome, colore, intestazioni delle colonne modificabili e il proprio fit
- **Errori** σx e σy per ogni punto, anche impostati per tutta la colonna (valore assoluto o percentuale), con barre d'errore
- **Fit** lineare, polinomiale (grado 2–8), esponenziale (con costante opzionale) e logaritmico, pesato con gli errori (σx con la varianza efficace); parametri con il loro errore, χ², χ² ridotto e R²; intervallo di fit impostabile da tastiera o trascinando le linee sul grafico
- **Colonne calcolate** con una formula (es. `t^2`, `s/t`, `sqrt(2*h/g)`) e propagazione automatica degli errori; qualsiasi colonna può andare sugli assi, utile per linearizzare
- **Altri modelli di fit:** potenza, sinusoidale, gaussiano e **formula libera** con i valori iniziali dei parametri; **grafico dei residui** (assoluti o normalizzati con σy)
- **Operazioni sui vettori:** somma, differenza, prodotto scalare e vettoriale (componente z), angolo tra i vettori; A, B e i risultati compaiono sul grafico con colori propri e si possono salvare nella serie "Risultati"
- **Snap magnetico** per i vettori: aggancio alle code e alle punte degli altri vettori e alla griglia
- Zoom con la rotella, spostamento della vista, assi automatici o manuali, importazione da CSV o foglio di calcolo, esportazione CSV e PNG

## Statistica

- Misure ripetute inserite una alla volta o incollate da un foglio di calcolo, in più gruppi
- Istogramma con classi automatiche (Sturges, o una per valore con dati interi), per numero o per larghezza e inizio; media e ±σ
- Confronto con le distribuzioni gaussiana, poissoniana, uniforme, esponenziale e log-normale: parametri stimati, conteggi attesi per classe e test del χ² con p-value
- Media, deviazione standard, errore della media, semidispersione, mediana; risultato x̄ ± σ/√N con la sensibilità dello strumento come limite inferiore

## Campo

- **Tre sfondi:** piano cartesiano, immagine (pianta, foto, mappa scansionata) o mappa geografica OpenStreetMap
- **Immagine:** si carica da file, si sposta trascinandola, si ridimensiona con il quadratino o la rotella; origine, dimensioni e misure degli assi si impostano a mano
- **Campo scalare** (es. temperatura) o **vettoriale** (es. velocità del vento), con nome e unità di misura
- **Inserimento dati:** clic sul piano con popup per il valore, trascinamento dei punti, tabella modificabile, importazione da CSV o incollando da un foglio di calcolo
- **Viste:** mappa a colori, mappa vettoriale (per uno scalare mostra il gradiente), linee di campo, isolinee (anche riempite a bande) e superficie 3D ruotabile
- **Divergenza e rotore** di un campo vettoriale (modulo del gradiente e laplaciano per uno scalare), mostrati con colori, isolinee o in 3D
- **Interpolazione:** spline thin-plate, inverso della distanza (IDW) o punto più vicino; ritaglio opzionale sull'area dei punti
- Sei scale di colori, scala automatica o fissa, esportazione CSV e PNG
- Tema chiaro e scuro, i dati restano salvati nel browser

## Tecnologie

React, TypeScript, Vite, Leaflet.

## Avvio in locale

```bash
npm install
npm run dev
```

Il workflow in `.github/workflows` pubblica il sito su GitHub Pages a ogni push.
