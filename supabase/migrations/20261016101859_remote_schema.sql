SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

REVOKE ALL ON FUNCTION "public"."match_memories"(uuid, extensions.vector, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "service_role";

CREATE OR REPLACE FUNCTION public.match_memories (
  p_patient_id      uuid,
  p_query_embedding extensions.vector,
  p_match_count     integer           DEFAULT 1
)
  RETURNS TABLE (
    memory_id  uuid,
    patient_id uuid,
    content    text,
    similarity double precision
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
    select
        m.id as memory_id,
        m.patient_id,
        m.content,
        1 - (m.embedding <=> p_query_embedding) as similarity
    from public.memories as m
    where m.patient_id = p_patient_id
      and m.embedding is not null
    order by m.embedding <=> p_query_embedding
    limit least(greatest(p_match_count, 1), 20);
$function$;

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

REVOKE ALL ON TABLE "public"."conversations" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."conversations" TO "anon";

REVOKE ALL ON TABLE "public"."memories" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."memories" TO "anon";

REVOKE ALL ON TABLE "public"."patients" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."patients" TO "anon";

REVOKE ALL ON TABLE "public"."reports" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."reports" TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

