/** Word and name pools for procedural generation (culturally mixed, clearly fictional). */

export const CODEWORDS = [
  "ORCHID", "KESTREL", "VANTA", "HALCYON", "TUNDRA", "MERIDIAN", "CINDER", "LODESTAR", "SEXTANT", "ZEPHYR", "OBSIDIAN", "LANTERN", "QUARTZ", "PARALLAX",
  "BASALT", "CORVID", "AURORA", "NIMBUS", "SOLSTICE", "HELIX", "EMBER", "TALON", "MARROW", "ONYX", "FATHOM", "GLACIER", "VESPER", "COBALT", "SPARROW",
  "RAVEN", "MONSOON", "FERRULE", "GIMBAL", "APOGEE", "PERIGEE", "ZENITH", "NADIR", "SIGNAL", "CIPHER", "WARDEN", "BEACON", "HARBOR", "THISTLE", "JUNIPER",
  "MAGNET", "PRISM", "RELAY", "VECTOR", "TEMPEST", "UMBRA", "PENUMBRA", "ISOTOPE", "FALCON", "MARLIN", "OSPREY", "PELICAN", "HERON", "PLOVER", "WREN",
];

export const FIRST_NAMES = [
  "Aarav", "Meera", "Ishaan", "Kavya", "Rohan", "Ananya", "Vikram", "Priya", "Arjun", "Nisha", "Dev", "Sana", "Kabir", "Leela", "Omar", "Zara", "Yusuf",
  "Amara", "Chen", "Mei", "Hiro", "Aiko", "Lukas", "Freya", "Mateo", "Lucia", "Tomas", "Ingrid", "Kofi", "Ama", "Tariq", "Noor", "Elena", "Ivan", "Sofia",
  "Diego", "Rafael", "Hana", "Jonas", "Maya", "Nikhil", "Riya", "Farhan", "Tara", "Gabriel", "Lina", "Oskar", "Esme", "Ravi", "Anika",
];

export const LAST_NAMES = [
  "Rao", "Iyer", "Menon", "Kapoor", "Sharma", "Nair", "Bose", "Das", "Khan", "Siddiqui", "Varga", "Marsh", "Whitlock", "Okafor", "Mensah", "Tanaka", "Sato",
  "Lindqvist", "Novak", "Moreau", "Rossi", "Silva", "Costa", "Haddad", "Farouk", "Petrov", "Kowalski", "Brennan", "Quinn", "Ashford", "Delacroix", "Fonseca",
  "Gupta", "Hegde", "Joshi", "Kulkarni", "Mehta", "Patil", "Reddy", "Shetty",
];

export const COMPANIES = ["Corvid Aerospace", "Halvorsen Dynamics", "Northwind Telemetry", "Ashgrove Systems", "Meridian Orbital", "Blue Heron Labs", "Tessellate Analytics"];

export const DEPARTMENTS = ["Robotics", "Facilities", "IT Services", "Aerospace", "Security", "Finance", "Registrar", "Physics", "Library"];

export const VEHICLE_MAKES = ["Maruti Swift", "Honda City", "Hyundai i20", "Tata Nexon", "Toyota Innova", "Royal Enfield Classic", "Honda Activa", "Kia Seltos"];

export const COLORS = ["white", "silver", "grey", "black", "red", "blue", "maroon"];

export const LOREM = [
  "Weekly sync moved to Thursday.", "Please return borrowed oscilloscopes to bench 4.", "Reminder: badge audits start next week.",
  "The coffee machine in B-wing is fixed.", "Firmware 2.3 rolls out to all ground rigs on Monday.", "Parking lot C closes for resurfacing.",
  "Seminar: adaptive control for small satellites.", "New safety induction slides are on the drive.", "Grant reports are due at month end.",
];

export function personName(first: string, last: string) {
  return `${first} ${last}`;
}

export function username(first: string, last: string) {
  return `${first[0]!.toLowerCase()}${last.toLowerCase().replace(/[^a-z]/g, "")}`;
}
