// Default two-level category tree and keyword hints for quick-add.

export interface SeedCategory {
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
  children: { name: string; icon: string }[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Food", icon: "🍽️", color: "#f97316", kind: "expense",
    children: [
      { name: "Delivery", icon: "🛵" }, { name: "Dining out", icon: "🍛" },
      { name: "Groceries", icon: "🛒" }, { name: "Tea & snacks", icon: "☕" },
    ],
  },
  {
    name: "Transport", icon: "🚗", color: "#3b82f6", kind: "expense",
    children: [
      { name: "Cab", icon: "🚕" }, { name: "Metro", icon: "🚇" }, { name: "Fuel", icon: "⛽" },
      { name: "Auto", icon: "🛺" }, { name: "Train & bus", icon: "🚆" }, { name: "Parking & tolls", icon: "🅿️" },
    ],
  },
  {
    name: "Housing", icon: "🏠", color: "#8b5cf6", kind: "expense",
    children: [{ name: "Rent", icon: "🔑" }, { name: "Maintenance", icon: "🧰" }, { name: "Household help", icon: "🧹" }],
  },
  {
    name: "Bills & Utilities", icon: "💡", color: "#eab308", kind: "expense",
    children: [
      { name: "Electricity", icon: "⚡" }, { name: "Internet", icon: "🌐" }, { name: "Mobile", icon: "📱" },
      { name: "Gas", icon: "🔥" }, { name: "Water", icon: "🚰" }, { name: "Subscriptions", icon: "📺" },
    ],
  },
  {
    name: "Shopping", icon: "🛍️", color: "#ec4899", kind: "expense",
    children: [
      { name: "Online", icon: "📦" }, { name: "Clothes", icon: "👕" },
      { name: "Electronics", icon: "💻" }, { name: "Home", icon: "🛋️" },
    ],
  },
  {
    name: "Entertainment", icon: "🎬", color: "#14b8a6", kind: "expense",
    children: [{ name: "Movies", icon: "🍿" }, { name: "Events", icon: "🎟️" }, { name: "Games", icon: "🎮" }, { name: "Drinks", icon: "🍻" }],
  },
  {
    name: "Health", icon: "🩺", color: "#ef4444", kind: "expense",
    children: [{ name: "Medicines", icon: "💊" }, { name: "Doctor", icon: "👩‍⚕️" }, { name: "Fitness", icon: "🏋️" }, { name: "Insurance", icon: "🛡️" }],
  },
  {
    name: "Personal care", icon: "💇", color: "#a855f7", kind: "expense",
    children: [{ name: "Salon", icon: "💈" }, { name: "Grooming", icon: "🧴" }],
  },
  {
    name: "Travel", icon: "✈️", color: "#06b6d4", kind: "expense",
    children: [{ name: "Flights", icon: "🛫" }, { name: "Hotels", icon: "🏨" }, { name: "Trips", icon: "🧳" }],
  },
  { name: "Education", icon: "📚", color: "#22c55e", kind: "expense", children: [{ name: "Courses", icon: "🎓" }, { name: "Books", icon: "📖" }] },
  { name: "Gifts & donations", icon: "🎁", color: "#f43f5e", kind: "expense", children: [] },
  { name: "Family", icon: "👪", color: "#84cc16", kind: "expense", children: [] },
  {
    name: "Fees & charges", icon: "🧾", color: "#64748b", kind: "expense",
    children: [{ name: "Card fees", icon: "💳" }, { name: "Interest", icon: "📈" }, { name: "Bank charges", icon: "🏦" }],
  },
  { name: "Investments", icon: "📊", color: "#10b981", kind: "expense", children: [{ name: "SIP", icon: "🔁" }, { name: "IPO", icon: "🚀" }] },
  { name: "Misc", icon: "🧩", color: "#94a3b8", kind: "expense", children: [] },
  {
    name: "Income", icon: "💰", color: "#22c55e", kind: "income",
    children: [
      { name: "Salary", icon: "🏢" }, { name: "Interest", icon: "🏦" }, { name: "Cashback", icon: "🎉" },
      { name: "Freelance", icon: "🧑‍💻" }, { name: "Gifts received", icon: "🎁" }, { name: "Other income", icon: "➕" },
    ],
  },
];

/** Keyword → "Parent › Child" path. First match wins; longer keys are checked first. */
export const KEYWORDS: Record<string, string> = {
  swiggy: "Food › Delivery", zomato: "Food › Delivery", eatsure: "Food › Delivery", dominos: "Food › Delivery", pizza: "Food › Delivery",
  dinner: "Food › Dining out", lunch: "Food › Dining out", breakfast: "Food › Dining out", restaurant: "Food › Dining out", cafe: "Food › Dining out", biryani: "Food › Dining out",
  chai: "Food › Tea & snacks", tea: "Food › Tea & snacks", coffee: "Food › Tea & snacks", snacks: "Food › Tea & snacks", samosa: "Food › Tea & snacks",
  blinkit: "Food › Groceries", zepto: "Food › Groceries", bigbasket: "Food › Groceries", instamart: "Food › Groceries", grocery: "Food › Groceries", groceries: "Food › Groceries", dmart: "Food › Groceries", milk: "Food › Groceries", vegetables: "Food › Groceries",
  uber: "Transport › Cab", ola: "Transport › Cab", rapido: "Transport › Cab", cab: "Transport › Cab", taxi: "Transport › Cab",
  metro: "Transport › Metro", petrol: "Transport › Fuel", fuel: "Transport › Fuel", diesel: "Transport › Fuel",
  auto: "Transport › Auto", train: "Transport › Train & bus", irctc: "Transport › Train & bus", bus: "Transport › Train & bus", parking: "Transport › Parking & tolls", fastag: "Transport › Parking & tolls", toll: "Transport › Parking & tolls",
  rent: "Housing › Rent", maintenance: "Housing › Maintenance", maid: "Housing › Household help",
  electricity: "Bills & Utilities › Electricity", bescom: "Bills & Utilities › Electricity", msedcl: "Bills & Utilities › Electricity",
  wifi: "Bills & Utilities › Internet", broadband: "Bills & Utilities › Internet", airtel: "Bills & Utilities › Mobile", jio: "Bills & Utilities › Mobile", recharge: "Bills & Utilities › Mobile", mobile: "Bills & Utilities › Mobile",
  netflix: "Bills & Utilities › Subscriptions", spotify: "Bills & Utilities › Subscriptions", hotstar: "Bills & Utilities › Subscriptions", prime: "Bills & Utilities › Subscriptions", youtube: "Bills & Utilities › Subscriptions", subscription: "Bills & Utilities › Subscriptions",
  amazon: "Shopping › Online", flipkart: "Shopping › Online", myntra: "Shopping › Clothes", ajio: "Shopping › Clothes", clothes: "Shopping › Clothes", shoes: "Shopping › Clothes", croma: "Shopping › Electronics",
  movie: "Entertainment › Movies", movies: "Entertainment › Movies", pvr: "Entertainment › Movies", inox: "Entertainment › Movies", bookmyshow: "Entertainment › Events", concert: "Entertainment › Events", beer: "Entertainment › Drinks", drinks: "Entertainment › Drinks", bar: "Entertainment › Drinks", pub: "Entertainment › Drinks",
  medicine: "Health › Medicines", pharmacy: "Health › Medicines", apollo: "Health › Medicines", doctor: "Health › Doctor", gym: "Health › Fitness", cultfit: "Health › Fitness",
  haircut: "Personal care › Salon", salon: "Personal care › Salon",
  flight: "Travel › Flights", indigo: "Travel › Flights", hotel: "Travel › Hotels", oyo: "Travel › Hotels", trip: "Travel › Trips",
  course: "Education › Courses", udemy: "Education › Courses", book: "Education › Books", books: "Education › Books",
  gift: "Gifts & donations", donation: "Gifts & donations",
  salary: "Income › Salary", cashback: "Income › Cashback", interest: "Income › Interest", freelance: "Income › Freelance",
  sip: "Investments › SIP",
};
