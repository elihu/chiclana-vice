@AGENTS.md

## Claude Code

- `AGENTS.md` es la fuente única de instrucciones; este archivo solo lo importa y añade lo
  específico de Claude Code. No dupliques reglas aquí.
- Permisos compartidos en `.claude/settings.json`. Las preferencias personales van en
  `.claude/settings.local.json` o `CLAUDE.local.md`, ambos ignorados por Git.
- Habilidades del proyecto: `/revisar-rama` y `/integrar-rama` (en `.agents/skills/`,
  enlazadas desde `.claude/skills/`).
