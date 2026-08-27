# Changelog

## 1.0.0 (Unreleased)

- Reduz o bundle inicial do plugin com carregamento sob demanda de SQL Charts,
  Library, Calculation, Sheets, SQL Query e Programming.
- Distribui no tempo a primeira atualização periódica dos valores PI para evitar
  picos de consultas quando muitos clientes abrem o mesmo display.
- Elimina a segunda gravação redundante na criação de dashboards.
- Otimiza o logo principal e mantém os catálogos industriais fora do caminho
  inicial de visualização.
- Valida 100 clientes simultâneos no ambiente de QA com 4.600 requisições e 100%
  de sucesso. Consulte `QA_LOAD_TEST.md`.
