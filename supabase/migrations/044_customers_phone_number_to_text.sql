-- Change phone_number from numeric to text to preserve leading zeros and allow formatting characters
UPDATE "Customers"
SET phone_number = NULL
WHERE phone_number IS NOT NULL AND phone_number = 0;

ALTER TABLE "Customers"
  ALTER COLUMN phone_number TYPE text
  USING CASE
    WHEN phone_number IS NULL THEN NULL
    WHEN phone_number = 0 THEN NULL
    ELSE trim(to_char(phone_number, 'FM999999999999'))
  END;
