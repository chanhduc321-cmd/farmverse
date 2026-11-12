ALTER TABLE public.farm_guest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_account_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_crop_steals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.farm_guest_progress, public.farm_accounts,
  public.farm_account_sessions, public.farm_friendships,
  public.farm_crop_steals, public.farm_activities FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.farm_activities_id_seq FROM PUBLIC;

-- These Data API roles exist on Supabase. Gameplay uses the server DB role.
DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.farm_guest_progress, public.farm_accounts,
       public.farm_account_sessions, public.farm_friendships,
       public.farm_crop_steals, public.farm_activities FROM %I', api_role
    );
    EXECUTE format('REVOKE ALL ON SEQUENCE public.farm_activities_id_seq FROM %I', api_role);
  END LOOP;
END $$;
