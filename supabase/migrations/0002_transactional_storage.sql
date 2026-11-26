-- Run AFTER 0001. Server-only storage; does not switch the live application.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gvcn_nodes (
  school_year text NOT NULL, node_key text NOT NULL, value jsonb NOT NULL,
  PRIMARY KEY(school_year,node_key)
);
ALTER TABLE public.gvcn_nodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gvcn_nodes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.gvcn_nodes TO service_role;

-- Rebuild the existing service shape while keeping months in independent rows.
CREATE OR REPLACE FUNCTION public.gvcn_value(y text,p text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record; v jsonb; classes jsonb; months jsonb; k text;
BEGIN
  IF cardinality(p)=0 THEN
    SELECT jsonb_object_agg(node_key,value) INTO v FROM gvcn_nodes WHERE school_year=y;
    SELECT jsonb_object_agg(class_id,gvcn_value(y,ARRAY['classes',class_id])) INTO classes FROM gvcn_classes WHERE school_year=y;
    IF v IS NULL AND classes IS NULL THEN RETURN NULL; END IF;
    RETURN coalesce(v,'{}')||jsonb_build_object('classes',coalesce(classes,'{}'));
  END IF;
  IF p[1]='classes' THEN
    IF cardinality(p)=1 THEN
      SELECT jsonb_object_agg(class_id,gvcn_value(y,ARRAY['classes',class_id])) INTO v FROM gvcn_classes WHERE school_year=y;
      RETURN v;
    END IF;
    SELECT * INTO c FROM gvcn_classes WHERE school_year=y AND class_id=p[2];
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p[3]='revision' THEN RETURN to_jsonb(c.revision); END IF;
    IF p[3]='data' AND p[4]='months' AND cardinality(p)>=5 THEN
      SELECT data INTO v FROM gvcn_class_months WHERE school_year=y AND class_id=p[2] AND month_key=replace(p[5],'_','/');
      IF cardinality(p)>5 THEN RETURN v #> p[6:cardinality(p)]; END IF; RETURN v;
    END IF;
    IF p[3]='data' AND p[4] IN ('students','profiles') THEN
      v:=CASE WHEN p[4]='students' THEN c.students ELSE c.profiles END;
      IF cardinality(p)>4 THEN RETURN v #> p[5:cardinality(p)]; END IF; RETURN v;
    END IF;
    SELECT jsonb_object_agg(replace(month_key,'/','_'),data) INTO months FROM gvcn_class_months WHERE school_year=y AND class_id=p[2];
    v:=coalesce(c.metadata->'record','{}')||jsonb_build_object('revision',c.revision,'data',
      coalesce(c.metadata->'data','{}')||jsonb_build_object('students',c.students,'profiles',c.profiles,'months',coalesce(months,'{}')));
    IF cardinality(p)>2 THEN RETURN v #> p[3:cardinality(p)]; END IF; RETURN v;
  END IF;
  SELECT value INTO v FROM gvcn_nodes WHERE school_year=y AND node_key=p[1];
  IF cardinality(p)>1 THEN RETURN v #> p[2:cardinality(p)]; END IF; RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.gvcn_write_class(y text,id text,v jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb:=v->'data'; item record; keys text[];
BEGIN
  INSERT INTO gvcn_classes(school_year,class_id,revision,metadata,students,profiles)
    VALUES(y,id,coalesce((v->>'revision')::bigint,0),jsonb_build_object('record',v-'data'-'revision','data',d-'months'-'students'-'profiles'),
      coalesce(d->'students','[]'),coalesce(d->'profiles','[]'))
    ON CONFLICT(school_year,class_id) DO UPDATE SET revision=excluded.revision,metadata=excluded.metadata,
      students=excluded.students,profiles=excluded.profiles,updated_at=now()
    WHERE (gvcn_classes.revision,gvcn_classes.metadata,gvcn_classes.students,gvcn_classes.profiles)
      IS DISTINCT FROM (excluded.revision,excluded.metadata,excluded.students,excluded.profiles);
  FOR item IN SELECT * FROM jsonb_each(coalesce(d->'months','{}')) LOOP
    INSERT INTO gvcn_class_months(school_year,class_id,month_key,revision,data)
      VALUES(y,id,replace(item.key,'_','/'),coalesce((item.value->>'_revision')::bigint,0),item.value)
      ON CONFLICT(school_year,class_id,month_key) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=now()
      WHERE gvcn_class_months.data IS DISTINCT FROM excluded.data;
  END LOOP;
  SELECT array_agg(replace(key,'_','/')) INTO keys FROM jsonb_object_keys(coalesce(d->'months','{}')) AS key;
  DELETE FROM gvcn_class_months WHERE school_year=y AND class_id=id AND NOT(month_key=ANY(coalesce(keys,ARRAY[]::text[])));
END $$;

CREATE OR REPLACE FUNCTION public.gvcn_read(y text,p text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('value',v,'version',md5(coalesce(v::text,'null'))) FROM (SELECT gvcn_value(y,p) AS v) s;
$$;

-- A single SQL transaction compares the current value, then writes changed rows.
-- The short advisory lock also protects parent/root writes used by role management.
CREATE OR REPLACE FUNCTION public.gvcn_cas(y text,p text[],expected text,next_value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_value jsonb; item record; parent_value jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gvcn:'||y,0));
  current_value:=gvcn_value(y,p);
  IF md5(coalesce(current_value::text,'null')) IS DISTINCT FROM expected THEN RETURN jsonb_build_object('committed',false); END IF;
  IF cardinality(p)=0 THEN
    FOR item IN SELECT * FROM jsonb_each(next_value-'classes') LOOP
      INSERT INTO gvcn_nodes VALUES(y,item.key,item.value) ON CONFLICT(school_year,node_key)
      DO UPDATE SET value=excluded.value WHERE gvcn_nodes.value IS DISTINCT FROM excluded.value;
    END LOOP;
    DELETE FROM gvcn_nodes WHERE school_year=y AND NOT(next_value ? node_key);
    FOR item IN SELECT * FROM jsonb_each(coalesce(next_value->'classes','{}')) LOOP
      PERFORM gvcn_write_class(y,item.key,item.value);
    END LOOP;
    DELETE FROM gvcn_class_months WHERE school_year=y AND NOT(coalesce(next_value->'classes','{}') ? class_id);
    DELETE FROM gvcn_classes WHERE school_year=y AND NOT(coalesce(next_value->'classes','{}') ? class_id);
  ELSIF p[1]='classes' AND cardinality(p)=2 THEN
    PERFORM gvcn_write_class(y,p[2],next_value);
  ELSIF p[1]<>'classes' THEN
    parent_value:=CASE WHEN cardinality(p)=1 THEN next_value ELSE jsonb_set(coalesce(gvcn_value(y,ARRAY[p[1]]),'{}'),p[2:cardinality(p)],next_value,true) END;
    INSERT INTO gvcn_nodes VALUES(y,p[1],parent_value) ON CONFLICT(school_year,node_key) DO UPDATE SET value=excluded.value;
  ELSE RAISE EXCEPTION 'Unsupported write path'; END IF;
  RETURN jsonb_build_object('committed',true);
END $$;

REVOKE ALL ON FUNCTION public.gvcn_value(text,text[]),public.gvcn_write_class(text,text,jsonb),public.gvcn_read(text,text[]),public.gvcn_cas(text,text[],text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gvcn_read(text,text[]),public.gvcn_cas(text,text[],text,jsonb) TO service_role;
INSERT INTO public.gvcn_integration_status(component,schema_version) VALUES('gvcn-storage',2)
  ON CONFLICT(component) DO UPDATE SET schema_version=excluded.schema_version;
COMMIT;
SELECT component,schema_version FROM public.gvcn_integration_status WHERE component='gvcn-storage';
