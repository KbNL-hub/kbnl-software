-- Fix: store_sales.posted_by FK references truck_admins which excludes desk officers
-- and other non-admin roles. Change to auth.users(id) so any authenticated user can post.

ALTER TABLE store_sales DROP CONSTRAINT IF EXISTS store_sales_posted_by_fkey;
ALTER TABLE store_sales ADD CONSTRAINT store_sales_posted_by_fkey
  FOREIGN KEY (posted_by) REFERENCES auth.users(id);
