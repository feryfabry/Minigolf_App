# Firebase Setup (5 Minuten, kostenlos)

## 1. Firebase-Projekt erstellen

1. Gehe zu **https://console.firebase.google.com**
2. Klick **"Projekt hinzufügen"**
3. Name: z.B. `minigolf-scorecard`
4. Google Analytics: kannst du deaktivieren → **Projekt erstellen**

## 2. Realtime Database aktivieren

1. Im Firebase-Dashboard: **Build → Realtime Database**
2. Klick **"Datenbank erstellen"**
3. Standort: **europe-west1** (Frankfurt)
4. Sicherheitsregeln: wähle **"Im Testmodus starten"**
   - (Erlaubt 30 Tage lang Lesen/Schreiben ohne Auth – reicht zum Testen)

## 3. Web-App registrieren

1. Im Dashboard: Klick auf das **Web-Icon** `</>` (oben)
2. App-Name: `Minigolf`
3. Firebase Hosting: **NICHT** ankreuzen
4. Klick **"App registrieren"**
5. Du bekommst einen Code-Block mit `firebaseConfig` – kopiere die Werte

## 4. Config in die App eintragen

Öffne `firebase-config.js` und ersetze die Platzhalter:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",               // ← aus Firebase kopieren
    authDomain: "minigolf-xyz.firebaseapp.com",
    databaseURL: "https://minigolf-xyz-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "minigolf-xyz",
    storageBucket: "minigolf-xyz.appspot.com",
    messagingSenderId: "123...",
    appId: "1:123...:web:abc..."
};
```

## 5. Sicherheitsregeln (nach dem Testen)

Für Produktion, ersetze die Regeln in der Firebase-Konsole mit:

```json
{
  "rules": {
    "games": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## 6. Deployment auf GitHub Pages

```bash
git init
git add .
git commit -m "Minigolf Multiplayer App"
git remote add origin https://github.com/DEIN_USER/minigolf.git
git push -u origin main
```

Dann in GitHub: **Settings → Pages → Source: main branch** → Save.

Deine App ist dann unter `https://DEIN_USER.github.io/minigolf/` erreichbar.

---

## So funktioniert's

1. **Spieler 1** öffnet die URL → "Neues Spiel erstellen" → bekommt Code z.B. `XKWM`
2. **Spieler 2-6** öffnen die gleiche URL → "Spiel beitreten" → geben `XKWM` ein
3. Host sieht alle Spieler in der Lobby → drückt "Spiel starten"
4. Alle sehen das Spielfeld, jeder kann Punkte eintragen (live synchronisiert)
