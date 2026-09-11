# Lavarropas "Qué Facha" 3000

Simulador de lavarropas en una sola página HTML. Cuando termina el ciclo de lavado,
grita **"¡Qué facha!"** — con cartel en pantalla, chicharra y voz (`speechSynthesis`).

## Uso

Abrí `index.html` en el navegador. No necesita servidor ni dependencias.

```bash
xdg-open index.html   # o simplemente arrastralo al navegador
```

## Qué hace

- **4 programas**: Rápido (12s), Normal (24s), Intenso (40s), Delicados (18s), con
  temperatura y rpm propios.
- **Fases reales del ciclo**: Llenado → (Prelavado opcional) → Lavado → Enjuague →
  Centrifugado → Fin, con display, cuenta regresiva y barra de progreso.
- **Animación**: tambor girando, nivel de agua por fase, burbujas, y vibración de la
  máquina durante el centrifugado.
- **Iniciar / Pausa / Reanudar / Cancelar** y log de eventos con timestamps.
- **Al terminar**: cartel a pantalla completa "¡QUÉ FACHA!", jingle de 4 notas
  (Web Audio) y la frase hablada en español. Ambos se pueden apagar desde Opciones.

Respeta `prefers-reduced-motion` (desactiva animaciones) y funciona igual si el
navegador bloquea audio o no tiene voces en español.
