-- Allow Southern California as a fishing-reports region.
alter table public.fishing_reports
  drop constraint if exists fishing_reports_region_check;

alter table public.fishing_reports
  add constraint fishing_reports_region_check
  check (region in ('new_england','mid_atlantic','southeast','gulf','socal'));
