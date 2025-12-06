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

STIDA v4.1 assumes four main input groups:

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
