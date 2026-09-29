begin;
-- A selected SDR list cannot silently become "all lists" when someone deletes its Radar job.
alter table crm.sdr_settings drop constraint sdr_settings_radar_job_company;
alter table crm.sdr_settings add constraint sdr_settings_radar_job_company
 foreign key(radar_job_id,organization_id) references crm.mining_jobs(id,organization_id) on delete restrict;
commit;
