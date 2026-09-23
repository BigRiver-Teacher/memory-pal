alter table public.memories
    add column if not exists confidence double precision,
    add column if not exists source_text text,
    add column if not exists source_offset integer;

alter table public.memories
    drop constraint if exists memories_confidence_range;

alter table public.memories
    add constraint memories_confidence_range
    check (
        confidence is null
        or (confidence >= 0 and confidence <= 1)
    );

comment on column public.memories.confidence is
    '结构化记忆提取置信度，范围 0-1';
comment on column public.memories.source_text is
    '记忆提取对应的原文片段';
comment on column public.memories.source_offset is
    '原文片段在来源文本中的可选起始位置';