CREATE TABLE global_counter (
    id smallint PRIMARY KEY CHECK (id = 1),
    value bigint NOT NULL DEFAULT 0 CHECK (value >= 0)
);

INSERT INTO global_counter (id, value) VALUES (1, 0);
