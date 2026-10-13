-- Correção de dados do planner pessoal. APLICAR SÓ DEPOIS de a tela nova estar em produção.
-- A tela antiga mandava o domingo como início da semana (data local de uma meia-noite UTC,
-- no fuso -03) e o servidor arredondava para a segunda-feira ANTERIOR: todo item gravado
-- por ela está uma semana atrás da semana em que a pessoa o escreveu.
UPDATE "PlannerItem" SET "weekOf" = "weekOf" + INTERVAL '7 days' WHERE "createdAt" < TIMESTAMP '2026-10-14 12:00:00';
