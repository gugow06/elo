-- Classificador offline (palavras-chave) usado quando não há LLM configurado.
ALTER TYPE origem_classif ADD VALUE IF NOT EXISTS 'offline';
