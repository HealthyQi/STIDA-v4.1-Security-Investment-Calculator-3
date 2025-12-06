STIDA v4.1 is an open-source Security Posture & Decision Calculator that helps security leaders answer:

“We have limited budget and many security initiatives.
Which ones should we fund first to reduce risk in the most defensible way?”

The calculator brings together three perspectives:

Maturity & Hygiene – Are our fundamental domains (governance, detection, backup, etc.) above a minimum standard of care?

Risk & Loss Avoidance – How much annual loss could each initiative realistically reduce?

Financial Efficiency – Given costs and time value of money, which initiatives give the best return on security investment (ROSI) under a fixed budget?

It then:

Enforces hygiene floors so you can’t skip basic controls to chase shiny projects.

Uses scenario-based risk reduction and correlation adjustments so benefits aren’t double-counted.

Computes NPV, ROSI, payback and a Net Benefit Density (NBD) metric (risk reduction per dollar).

Builds a budget-constrained portfolio using a transparent greedy heuristic (best NBD first, after mandatory items).

2. Inputs (What the User Provides)

STIDA v4.1 assumes FIVE main input groups:

Domains & KPIs

Domain 
𝑑
d: e.g., Governance, Detection, Architecture, Defense, Resilience

KPIs 
𝑘
k per domain (e.g., MFA coverage, backup success rate) with:

value_{d,k} ∈ [0,100] (maturity value)

weight_{d,k} ∈ [0,1] (importance within domain)

DQI_{d,k} ∈ [0,1] (data quality / confidence)

coverage_d ∈ [0,1] (how much of the estate this domain meaningfully affects)

Loss Scenarios 
𝑠
s

Example: Ransomware, Data Breach, BEC, Insider Threat

SLE_s — Single Loss Expectancy ($)

f_s — Annual frequency (events/year)

Optional: isCatastrophic_s (true/false) for Black Swan / org-ending scenarios.

Actions / Controls 
𝑎
a

Cost inputs:

C^{upfront}_a — upfront cost (CapEx)

C^{annual}_a — recurring annual cost (OpEx)

Effectiveness per scenario:

Type: PROBABILITY or IMPACT

Δp_{a,s} or ΔSLE_{a,s} (estimated reduction)

Optional: confidence level (High/Med/Low)

Domain linkage:

domainId_a (which domain’s maturity it lifts)

maturity_lift_a (points added to that domain’s raw score)

Optional:

degradation_rate_a (annual effectiveness decay, e.g., 0.10 = 10% per year)

Financial Parameters

B — Available budget (Year 1)

T — Time horizon (years, e.g., 3–5)

r — Discount rate (e.g., 10–15%, may be higher for security to reflect uncertainty)

---

## How STIDA Thinks (In Human Terms)

You can think of STIDA as a very opinionated assistant that looks at your security world in three passes:

1. **Are the basics covered?**
2. **What actually reduces loss?**
3. **What gives the best risk reduction for each dollar?**

Here’s how that plays out step by step.

---

### 1. It starts by asking: “How healthy are your foundations?”

First, you give STIDA a rough picture of your environment:

* A few **domains** like Governance, Detection, Architecture, Defense, Resilience
* 2–3 **signals per domain** (e.g., MFA coverage, backup success rate, detection time)
* A sense of **how reliable** each data point is (strong system data vs rough estimate)

STIDA blends those into a single **score per domain**, then adjusts for:

* **Coverage** – does this domain touch a small corner of the org, or most of it?
* **Data quality** – are we confident in the numbers or just guessing?

From that it builds a simple view:

> “These domains look reasonably solid; these ones are weak.”

Anything below a chosen **“hygiene floor”** (for example, 50%) is treated as a **foundational gap** that shouldn’t be ignored.

---

### 2. It asks: “Where is the money at risk?”

Next, you tell STIDA about a few **loss scenarios** you care about:

* Ransomware
* Data breach
* Business email compromise
* etc.

For each one, you estimate:

* **How big the damage would be** if it happened once
* **How often** it might happen in a typical year

From that, STIDA calculates a simple number:

> “On average, this scenario costs you about **X per year** if you change nothing.”

This is your **baseline annualized loss** for each scenario.

---

### 3. It looks at each project and asks: “What would this actually change?”

Now you list **initiatives or controls** you’re considering:

* “Roll out MFA to all users”
* “Fix backup gaps and test restores quarterly”
* “Deploy EDR to servers”
* “Run phishing training campaign”

For each, you give:

* **Upfront cost** and **ongoing yearly cost**
* Which scenarios it helps with
* Whether it mostly reduces **probability** (“this should happen less often”)
  or **impact** (“if it happens, the damage is smaller”)

STIDA then estimates, in plain terms:

> “If we do this, how much less money are we likely to lose each year?”

It also tries to avoid **double-counting**. For example:

* If you already funded strong MFA, the **extra benefit** from a password manager is smaller.
* If two projects hit the same scenario, STIDA dials back the second one’s benefit so you don’t count the same risk reduction twice.

It’s not pretending to be perfect here — it uses **simple, conservative rules** to stay honest rather than optimistic.

---

### 4. It puts on a CFO hat: “Is this a good security investment?”

Once it knows:

* **How much loss a project might avoid each year**, and
* **What it costs over time**,

STIDA runs a basic finance check:

* **How much avoided loss over the next 3–5 years, after discounting the future?**
* **How much are we spending in total (upfront + ongoing)?**
* **What’s the “return on security investment” (ROSI)?**
* **How long until the risk reduction “pays back” the upfront cost?**

Importantly, STIDA treats this as **cost avoidance**, not new revenue.
The question is:

> “For each dollar we spend here, roughly how many dollars of loss do we *not* suffer?”

---

### 5. It packs your “shopping cart” under a real budget

With all that in hand, STIDA builds a portfolio in two passes:

1. **Floor fixes first**

   * If any domain is below the hygiene floor, it prioritizes projects that raise those scores.
   * These are treated as **non-negotiable** “cost of doing business” items.

2. **Then the best value per dollar**

   * From the remaining projects, it ranks them by **risk-reduction-per-dollar**.
   * Starting from the top of that list, it adds each project to the portfolio **as long as there’s budget left**.
   * This is a simple, explainable “best bang for the buck” strategy — a practical approximation of optimal.

Along the way, it also checks any **catastrophic scenarios** you marked (the “this would sink us” events) and warns you if the final portfolio leaves any of them completely unaddressed.

---

### 6. It shows the before/after story

Finally, STIDA summarizes the result in human terms:

* **Which projects are funded**, and why (floor fix vs best value).
* **How much annual loss you’re likely avoiding**, in total.
* **What the overall ROSI and payback look like** for the portfolio.
* **How your domain scores change** — before vs after, and which ones rise above the hygiene floor.

So the story you can tell is:

> “We’re not just asking for budget.
> Here’s how this set of projects lifts our weakest areas,
> how much loss it is expected to avoid,
> and why we chose these projects instead of the others.”

That’s how STIDA “thinks”:
it combines **hygiene**, **risk**, and **money** into one consistent, transparent line of reasoning that a CISO, CFO, and Board can all follow — even if they never see a single formula.
