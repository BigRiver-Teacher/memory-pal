
create extension if not exists vector with schema extensions;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."match_memories"("p_patient_id" "uuid", "p_query_embedding" "extensions"."vector", "p_match_count" integer DEFAULT 1) RETURNS TABLE("memory_id" "uuid", "patient_id" "uuid", "content" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."match_memories"("p_patient_id" "uuid", "p_query_embedding" "extensions"."vector", "p_match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(1024),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_accessed" timestamp with time zone DEFAULT "now"() NOT NULL,
    "access_count" integer DEFAULT 0 NOT NULL,
    "emotion" "text",
    "entities" "text"[],
    "source" "text",
    "confidence" double precision,
    "source_text" "text",
    "source_offset" integer,
    CONSTRAINT "memories_access_count_check" CHECK (("access_count" >= 0)),
    CONSTRAINT "memories_confidence_range" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))))
);


ALTER TABLE "public"."memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "family_contact" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "report_date" "date" NOT NULL,
    "advice" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memories"
    ADD CONSTRAINT "memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_patient_date_key" UNIQUE ("patient_id", "report_date");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



CREATE INDEX "conversations_patient_id_created_at_idx" ON "public"."conversations" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "memories_embedding_hnsw_idx" ON "public"."memories" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "memories_patient_id_created_at_idx" ON "public"."memories" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "patients_owner_id_idx" ON "public"."patients" USING "btree" ("owner_id");



CREATE INDEX "reports_patient_date_idx" ON "public"."reports" USING "btree" ("patient_id", "report_date" DESC);



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memories"
    ADD CONSTRAINT "memories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_owner_policy" ON "public"."conversations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "conversations"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "conversations"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."memories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memories_owner_policy" ON "public"."memories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "memories"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "memories"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients_owner_policy" ON "public"."patients" TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_owner_policy" ON "public"."reports" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "reports"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."patients" "p"
  WHERE (("p"."id" = "reports"."patient_id") AND ("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_memories"("p_patient_id" "uuid", "p_query_embedding" "extensions"."vector", "p_match_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_memories"("p_patient_id" "uuid", "p_query_embedding" "extensions"."vector", "p_match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_memories"("p_patient_id" "uuid", "p_query_embedding" "extensions"."vector", "p_match_count" integer) TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."memories" TO "anon";
GRANT ALL ON TABLE "public"."memories" TO "authenticated";
GRANT ALL ON TABLE "public"."memories" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







