-- Skyin — initial schema. Money is stored as integer halalas (1 SAR = 100 halalas).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  name           text        NOT NULL,
  email          citext      NOT NULL UNIQUE,
  phone          text,
  password_hash  text        NOT NULL,
  role           text        NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE sessions (
  token_hash  text        PRIMARY KEY,               -- sha256 of the cookie value; the raw token is never stored
  user_id     bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE destinations (
  id             bigserial PRIMARY KEY,
  slug           text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city           text        NOT NULL,
  country        text        NOT NULL,
  region         text        NOT NULL,
  price_halalas  integer     NOT NULL CHECK (price_halalas >= 100),   -- price per traveller
  nights         integer     NOT NULL CHECK (nights BETWEEN 1 AND 60),
  c1             text        NOT NULL DEFAULT '#04B2CD',
  c2             text        NOT NULL DEFAULT '#0B2A3A',
  best           text        NOT NULL DEFAULT '',
  summary        text        NOT NULL DEFAULT '',
  highlights     jsonb       NOT NULL DEFAULT '[]',
  includes       jsonb       NOT NULL DEFAULT '[]',
  image_url      text,
  active         boolean     NOT NULL DEFAULT true,
  sort           integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id           bigserial PRIMARY KEY,
  user_id      bigint      REFERENCES users(id) ON DELETE SET NULL,
  name         text        NOT NULL,
  phone        text        NOT NULL,
  email        citext,
  service      text        NOT NULL,
  travel_date  date,
  travelers    integer     CHECK (travelers BETWEEN 1 AND 50),
  message      text,
  status       text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'closed')),
  admin_note   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_status_idx ON quotes(status, created_at DESC);

CREATE TABLE bookings (
  id                   bigserial PRIMARY KEY,
  ref                  text        NOT NULL UNIQUE,            -- customer-facing reference, e.g. SKY-7K3M9Q
  pay_token            text        NOT NULL UNIQUE,            -- secret for the payment link (pay.html?t=…)
  user_id              bigint      REFERENCES users(id) ON DELETE SET NULL,
  destination_id       bigint      REFERENCES destinations(id) ON DELETE SET NULL,
  quote_id             bigint      REFERENCES quotes(id) ON DELETE SET NULL,
  title                text        NOT NULL,
  customer_name        text        NOT NULL,
  customer_phone       text,
  customer_email       citext,
  travel_date          date,
  travelers            integer     NOT NULL CHECK (travelers BETWEEN 1 AND 50),
  unit_price_halalas   integer,
  total_halalas        integer     NOT NULL CHECK (total_halalas >= 100),
  currency             text        NOT NULL DEFAULT 'SAR',
  status               text        NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment', 'paid', 'confirmed', 'cancelled', 'refunded')),
  notes                text,
  admin_note           text,
  paid_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_user_idx ON bookings(user_id, created_at DESC);
CREATE INDEX bookings_status_idx ON bookings(status, created_at DESC);

CREATE TABLE payments (
  id              bigserial PRIMARY KEY,
  booking_id      bigint      NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider        text        NOT NULL,
  provider_ref    text,                                     -- e.g. Moyasar invoice id
  amount_halalas  integer     NOT NULL,
  currency        text        NOT NULL DEFAULT 'SAR',
  status          text        NOT NULL DEFAULT 'initiated'
                    CHECK (status IN ('initiated', 'paid', 'failed', 'cancelled', 'refunded')),
  checkout_url    text,
  failure_reason  text,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX payments_booking_idx ON payments(booking_id, created_at DESC);

CREATE TABLE messages (
  id          bigserial PRIMARY KEY,
  user_id     bigint      REFERENCES users(id) ON DELETE SET NULL,
  name        text        NOT NULL,
  phone       text,
  email       citext,
  topic       text        NOT NULL,
  message     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
