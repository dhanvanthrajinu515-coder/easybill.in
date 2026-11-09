CREATE TABLE bills(owner TEXT NOT NULL, mode TEXT NOT NULL, no INTEGER NOT NULL, cid TEXT NOT NULL, ts INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner,mode,no));
CREATE UNIQUE INDEX bills_cid ON bills(owner,cid);
CREATE INDEX bills_ts ON bills(owner,ts);
