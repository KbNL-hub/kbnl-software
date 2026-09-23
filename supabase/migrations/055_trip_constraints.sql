ALTER TABLE public."Trips"
  ADD CONSTRAINT trips_child_order_no_unique UNIQUE (child_order_no),
  ADD CONSTRAINT trips_atc_unique UNIQUE ("ATC");

ALTER TABLE public.dd_trips
  ADD CONSTRAINT dd_trips_child_order_no_unique UNIQUE (child_order_no),
  ADD CONSTRAINT dd_trips_atc_unique UNIQUE (atc);

CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_per_driver_idx
  ON public."Trips" (driver_id)
  WHERE trip_status IN ('In transit', 'On hold');
