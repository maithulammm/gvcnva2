-- Preparation only: this migration does not read, change or delete Firebase data.
-- All access goes through the existing Microsoft-authenticated server API.
BEGIN;

CREATE TABLE IF NOT EXISTS public.gvcn_classes (
  school_year text NOT NULL,
  class_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  students jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(students) = 'array'),
  profiles jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(profiles) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_year, class_id)
);

-- The five form collections remain together per month to allow atomic M01/M02
-- synchronization. A future server transaction checks revision before writing.
CREATE TABLE IF NOT EXISTS public.gvcn_class_months (
  school_year text NOT NULL,
  class_id text NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^T(0[1-9]|1[0-2])/[0-9]{4}$'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_year, class_id, month_key),
  FOREIGN KEY (school_year, class_id) REFERENCES public.gvcn_classes(school_year, class_id)
);

CREATE TABLE IF NOT EXISTS public.gvcn_integration_status (
  component text PRIMARY KEY,
  schema_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gvcn_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gvcn_class_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gvcn_integration_status ENABLE ROW LEVEL SECURITY;

-- No public browser policies: Microsoft login and assignment checks are performed
-- by Cloudflare. The secret key must remain server-only because it bypasses RLS.
REVOKE ALL ON public.gvcn_classes, public.gvcn_class_months, public.gvcn_integration_status FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gvcn_classes, public.gvcn_class_months TO service_role;
GRANT SELECT ON public.gvcn_integration_status TO service_role;

INSERT INTO public.gvcn_integration_status(component, schema_version)
VALUES ('gvcn-staging', 1) ON CONFLICT (component) DO NOTHING;

COMMIT;

SELECT component, schema_version FROM public.gvcn_integration_status
WHERE component = 'gvcn-staging';
