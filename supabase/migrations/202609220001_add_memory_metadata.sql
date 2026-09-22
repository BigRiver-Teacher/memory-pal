alter table public.memories
    add column if not exists emotion text,
    add column if not exists entities text[],
    add column if not exists source text;

comment on column public.memories.emotion is
    '记忆相关的简短情绪词';
comment on column public.memories.entities is
    '记忆关联的人物、地点、物品等关键词';
comment on column public.memories.source is
    '记忆来源：family 表示家属录入，patient 表示患者自述';