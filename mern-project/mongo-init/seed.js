db = db.getSiblingDB("sample_training");

db.records.insertMany([
  { name: "Ada Lovelace", position: "Backend Engineer", level: "Senior" },
  { name: "Alan Turing", position: "Platform Engineer", level: "Senior" },
  { name: "Grace Hopper", position: "DevOps Engineer", level: "Junior" },
]);
