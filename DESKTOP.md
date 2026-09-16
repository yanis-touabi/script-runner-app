# Resiliate — application bureau

Interface Electron + React autour de `reconcile_resiliations.py`.

## Ce que fait l'application

1. Vous choisissez une fois le **dossier de travail** (celui qui contient `SIM_DB`). Le chemin est mémorisé.
2. Vous ajoutez les fichiers de résiliation (bouton ou glisser-déposer). L'application les copie
   elle-même dans le sous-dossier `RESILIATION` (créé si absent).
3. « Lancer la réconciliation » copie le script dans le dossier de travail, l'exécute avec Python
   et affiche `stdout` / `stderr` en direct.
4. À la fin d'une exécution réussie : les fichiers de résiliation déposés **et** la copie du script
   sont supprimés, et les rapports `*_resiliations_found.xlsx` restent dans le dossier de travail.

## Prérequis sur le poste

- Python 3 accessible (`python3`, `python` ou `py`)
- `pip install openpyxl`

L'application détecte Python au démarrage et affiche l'erreur exacte s'il manque quelque chose.

## Développement

```bash
npm run electron:build   # construit la fenêtre
npx electron .           # lance l'application
# ou en une commande
npm run electron:start
```

## Packaging

```bash
npm run electron:package                       # Windows x64 par défaut
# autres plateformes : remplacer --platform par darwin ou linux
```

Le résultat se trouve dans `electron-release/`.

## Structure

| Fichier | Rôle |
| --- | --- |
| `electron/main.cjs` | processus principal : dossiers, copie/suppression des fichiers, exécution Python |
| `electron/preload.cjs` | pont sécurisé `window.recon` (contextIsolation activé) |
| `electron/python/reconcile_resiliations.py` | votre script, embarqué tel quel |
| `electron/renderer/` | point d'entrée de la fenêtre |
| `src/features/reconciler/` | interface React partagée (aussi visible dans l'aperçu web, en mode démo) |
| `electron/build/icon.png` | icône (glyphe Lucide « signal », licence ISC) |
