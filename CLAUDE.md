@AGENTS.md

## Claude Code

- `AGENTS.md` es la fuente única de instrucciones; este archivo solo lo importa y añade lo
  específico de Claude Code. No dupliques reglas aquí.
- Permisos compartidos en `.claude/settings.json`. Las preferencias personales van en
  `.claude/settings.local.json` o `CLAUDE.local.md`, ambos ignorados por Git.
- Habilidad del proyecto: `/integrar-rama` (en `.agents/skills/`, enlazada desde
  `.claude/skills/`).
