Testes rápidos - Dashboard Gestor

1) Iniciar servidor
- No PowerShell, a partir da pasta do projeto:
  - Se existir `start.ps1`: execute-o (pode ser necessário ajustar ExecutionPolicy) ou rode:

```powershell
$env:PORT=3000; node .\server.js
```

2) Abrir no navegador
- Acesse: http://localhost:3000

3) Validar dashboard
- Clique em "Gestores" e faça login (usuário demo: `admin` / senha: `1234`).
- Verifique se o canvas `graficoDashboardGestor` mostra barras com valores sobre as barras e rótulos abaixo.
- Verifique os cards métricos (Média, Maior, Menor) — o valor deve aparecer dentro do span azul ao lado do rótulo.
- Verifique o card Tendência: deverá mostrar algo como "↑ (slope 0.12) / MM:↑0.30" ou "↓...".

4) Filtragem e limpar filtro
- Use o filtro "Departamento" e a busca por nome para filtrar. O gráfico atualiza automaticamente (com debounce ~180ms).
- Clique em "Limpar filtro" para resetar ambos os filtros.

5) Resize
- Redimensione a janela e observe o re-render do canvas (debounced).

6) Depuração
- Se algum valor não aparecer: abra DevTools → Console → Network. Verifique a resposta de GET /avaliacoes e confirme que cada item tem `nome` e `nota`.

7) Observações
- Tendência combina regressão linear (slope) com média móvel (MM) e é pensada como indicação rápida, não como análise estatística avançada.


Se quiser, posso incorporar essas instruções direto no `index.html` como comentários ou adicionar um README.md mais completo.
