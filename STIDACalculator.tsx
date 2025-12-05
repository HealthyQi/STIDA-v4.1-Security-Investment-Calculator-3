import React, { useState, useMemo } from 'react';
import { 
  Shield, 
  Settings, 
  AlertCircle, 
  Lock, 
  TrendingUp, 
  Target,
  BarChart3,
  List,
  Database,
  Edit2,
  Plus,
  Trash2,
  CheckCircle2,
  Briefcase
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Line
} from 'recharts';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { Alert, AlertTitle, AlertDescription } from './ui/Alert';
import { Domain, Scenario, Action, DomainScore, CalculatedAction, PortfolioResult, Tier, KPI } from '../types';
import { DEFAULT_DOMAINS, DEFAULT_SCENARIOS, DEFAULT_ACTIONS, FLOOR_THRESHOLD } from '../constants';

const STIDACalculator: React.FC = () => {
  // --- STATE ---
  const [tier, setTier] = useState<Tier>('TIER_1');
  const [budget, setBudget] = useState(1000000);
  const [domains, setDomains] = useState<Domain[]>(DEFAULT_DOMAINS);
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [actions, setActions] = useState<Action[]>(DEFAULT_ACTIONS);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'inputs'>('dashboard');
  const [inputView, setInputView] = useState<'kpis' | 'actions'>('kpis');

  // --- HANDLERS ---
  const handleKPIChange = (domainId: string, kpiIndex: number, field: keyof KPI, value: string | number) => {
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      const newKpis = [...d.kpis];
      // @ts-ignore - Dynamic assignment safe due to input types
      newKpis[kpiIndex] = { ...newKpis[kpiIndex], [field]: value };
      return { ...d, kpis: newKpis };
    }));
  };

  const handleCoverageChange = (domainId: string, value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    setDomains(prev => prev.map(d => {
        if (d.id !== domainId) return d;
        return { ...d, coverage: clamped };
    }));
  };

  const handleAddKPI = (domainId: string) => {
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      if (d.kpis.length >= 6) return d; // Limit to 6
      return {
        ...d,
        kpis: [...d.kpis, { name: 'New KPI', value: 50, weight: 0.1, dqi: 0.5 }]
      };
    }));
  };

  const handleRemoveKPI = (domainId: string, index: number) => {
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      const newKpis = [...d.kpis];
      newKpis.splice(index, 1);
      return { ...d, kpis: newKpis };
    }));
  };

  const handleActionChange = (actionId: string, field: keyof Action, value: any) => {
    setActions(prev => prev.map(a => {
        if (a.id !== actionId) return a;
        return { ...a, [field]: value };
    }));
  };

  // --- CORE LOGIC: Domain Scoring ---
  const domainScores: DomainScore[] = useMemo(() => {
    return domains.map(d => {
      // 1. Calculate Raw Maturity (DQI-Weighted Average)
      // Uses Data Quality Index (DQI) to trust reliable data more than poor data
      // Formula: Sum(Value * Weight * DQI) / Sum(Weight * DQI)
      
      const totalAdjustedWeight = d.kpis.reduce((acc, k) => acc + (k.weight * k.dqi), 0);
      
      const rawScore = totalAdjustedWeight > 0 
        ? d.kpis.reduce((acc, k) => acc + (k.value * k.weight * k.dqi), 0) / totalAdjustedWeight
        : 0;
      
      // 2. Calculate S* (Effectiveness) = Maturity * Coverage
      // Normalize raw score 0-100 to 0-1 for calculation
      const maturity = rawScore / 100;
      const sStar = maturity * d.coverage;

      // 3. Check Floor
      const meetsFloor = sStar >= FLOOR_THRESHOLD;

      return { ...d, rawScore, sStar, meetsFloor };
    });
  }, [domains]);

  // --- CORE LOGIC: Portfolio Optimization (The Recompute Loop) ---
  const portfolio: PortfolioResult = useMemo(() => {
    let currentBudget = 0; // Tracks Year 1 Cost (Upfront + Year 1 Annual)
    let totalUpfront = 0;
    let totalAnnual = 0;

    const selectedActions: CalculatedAction[] = [];
    let availableActions = [...actions];

    // Helper: Calculate Metrics for a specific action state
    const calculateMetrics = (action: Action, fundedActions: Action[]): CalculatedAction => {
      let totalDeltaALE = 0;
      
      // CRITICAL: SCENARIO-SPECIFIC MAPPING & CAPS
      scenarios.forEach(scen => {
        const eff = action.effectiveness[scen.id];
        if (!eff) return; // Action does not apply to this scenario

        // 1. Raw Reduction with Safety Caps
        let rawReduction = 0;
        if (eff.type === 'PROBABILITY') {
          // Reduces Frequency. Cap at 100% (1.0)
          // NewALE = SLE * (Freq * (1 - deltaP)) -> Delta = SLE * Freq * deltaP
          const cappedAmount = Math.min(eff.amount, 1.0);
          rawReduction = scen.sle * scen.frequency * cappedAmount;
        } else if (eff.type === 'IMPACT') {
          // Reduces Impact. Cap at Total SLE.
          // NewALE = (SLE - deltaSLE) * Freq -> Delta = deltaSLE * Freq
          const cappedAmount = Math.min(eff.amount, scen.sle);
          rawReduction = cappedAmount * scen.frequency;
        }

        // 2. Correlation Penalty (Domain-Based Heuristic)
        // Check for overlap with already funded actions IN THIS SCENARIO
        let penaltySum = 0;
        fundedActions.forEach(funded => {
          if (funded.effectiveness[scen.id]) {
             // Heuristic: Same domain = high correlation (0.4), Different domain = low (0.15)
             const rho = (funded.domainId === action.domainId) ? 0.4 : 0.15;
             penaltySum += rho;
          }
        });

        // Dampening: Apply penalty. Limit max penalty to 80%.
        // We assume penaltySum represents total overlapping 'resistance'.
        // Factor = min(penaltySum * 0.2, 0.8) -> moderate scaling
        const penaltyFactor = Math.min(penaltySum * 0.2, 0.8);
        
        const effectiveReduction = rawReduction * (1 - penaltyFactor);
        totalDeltaALE += effectiveReduction;
      });

      // FINANCIAL FORMULAS (CFO-GRADE)
      // PV Factors for 10% rate: Y1=0.909, Y2=0.826, Y3=0.751. Sum = 2.486
      const pvFactorSum = 2.486;
      
      // PV(Benefits)
      const pvBenefits = totalDeltaALE * pvFactorSum;
      
      // PV(Costs) = Upfront + PV(Annual Recurring)
      const pvCosts = action.cost_upfront + (action.cost_annual * pvFactorSum);
      
      // Year 1 Cash Flow (Budget Constraint)
      const year1Cost = action.cost_upfront + action.cost_annual;

      // NPV
      const npv = pvBenefits - pvCosts;

      // ROI & BCR
      const roi = pvCosts > 0 ? (pvBenefits - pvCosts) / pvCosts : 0;
      const bcr = pvCosts > 0 ? pvBenefits / pvCosts : 0;
      
      // NBD (Net Benefit per Dollar of Budget/Constraint)
      const nbd = year1Cost > 0 ? totalDeltaALE / year1Cost : 0;

      // Payback: Years to recover Upfront + Annual
      // Simple Payback = Cost / Annual_Benefit_Net_of_Opex
      const netAnnualBenefit = totalDeltaALE - action.cost_annual;
      const paybackMonths = netAnnualBenefit > 0 ? (action.cost_upfront / netAnnualBenefit) * 12 : 999;

      return { ...action, nbd, paybackMonths, npv, roi, bcr, totalDeltaALE, year1Cost };
    };

    // STEP 1: Mandatory Floor Fixes
    const floorViolations = domainScores.filter(d => !d.meetsFloor).map(d => d.id);
    const floorActions = availableActions.filter(a => floorViolations.includes(a.domainId) || a.isFloorFix);
    
    floorActions.forEach(action => {
      // Calculate Year 1 Cost
      const y1Cost = action.cost_upfront + action.cost_annual;
      
      if (currentBudget + y1Cost <= budget) {
        const metrics = calculateMetrics(action, selectedActions); 
        selectedActions.push({ ...metrics, reason: 'MANDATORY (Floor < 0.50)' });
        currentBudget += y1Cost;
        totalUpfront += action.cost_upfront;
        totalAnnual += action.cost_annual;
        availableActions = availableActions.filter(a => a.id !== action.id);
      }
    });

    // STEP 2: Optimize Remaining (The Loop)
    let optimizing = true;
    while (optimizing && availableActions.length > 0) {
      // Recompute metrics for all candidates
      const candidates = availableActions.map(a => calculateMetrics(a, selectedActions));
      
      // Sort by NBD
      candidates.sort((a, b) => b.nbd - a.nbd);
      
      const best = candidates[0];
      
      if (best && currentBudget + best.year1Cost <= budget) {
        selectedActions.push({ ...best, reason: 'Optimized (Best NBD)' });
        currentBudget += best.year1Cost;
        totalUpfront += best.cost_upfront;
        totalAnnual += best.cost_annual;
        availableActions = availableActions.filter(a => a.id !== best.id);
      } else {
        optimizing = false; 
      }
    }

    return { selectedActions, totalYear1Cost: currentBudget, totalUpfront, totalAnnual };

  }, [actions, budget, domainScores, scenarios]);

  // --- RENDER HELPERS ---
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  
  const formatPercent = (val: number) => 
    `${(val * 100).toFixed(1)}%`;

  const domainChartData = domainScores.map(d => ({
    name: d.id,
    Score: d.sStar,
    Floor: FLOOR_THRESHOLD
  }));

  const portfolioChartData = portfolio.selectedActions.map((a, i) => ({
    name: `A${i+1}`,
    cost: a.year1Cost,
    benefit: a.totalDeltaALE,
    nbd: a.nbd
  }));


  return (
    <div className="w-full max-w-7xl mx-auto p-4 space-y-6 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 text-white p-6 rounded-lg shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-400" />
            STIDA v4.1 Calculator
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            {tier === 'TIER_1' ? 'Tier 1: Rapid Assessment Mode' : 'Tier 2: CFO-Grade Validation Mode'}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-end md:items-center gap-4 w-full md:w-auto">
            <div className="text-right">
                <div className="text-xs text-slate-400">Total Year 1 Budget</div>
                <div className="font-mono font-bold text-xl text-green-400">{formatCurrency(budget)}</div>
            </div>
            <button 
                onClick={() => setTier(tier === 'TIER_1' ? 'TIER_2' : 'TIER_1')}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded text-sm transition-colors text-white"
            >
                <Settings className="w-4 h-4" />
                {tier === 'TIER_1' ? 'Switch to Tier 2' : 'Switch to Tier 1'}
            </button>
        </div>
      </div>

      {/* TABS HEADER */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <BarChart3 className="w-4 h-4" />
          Executive Dashboard
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'analysis' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <List className="w-4 h-4" />
          Financial Breakdown
        </button>
        <button
          onClick={() => setActiveTab('inputs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'inputs' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <Database className="w-4 h-4" />
          Data Inputs
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* FLOORS ALERT */}
            {domainScores.some(d => !d.meetsFloor) && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Critical Floor Violations Detected</AlertTitle>
                    <AlertDescription>
                        The following domains are below the 0.50 effectiveness floor. Remediation is mandatory before discretionary optimization.
                        <ul className="list-disc ml-6 mt-2 text-sm">
                            {domainScores.filter(d => !d.meetsFloor).map(d => (
                                <li key={d.id}>
                                    <strong>{d.name} ({d.id})</strong>: Current Score {formatPercent(d.sStar)}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {/* DOMAIN SCORES GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {domainScores.map(domain => (
                    <Card key={domain.id} className={`transition-all ${!domain.meetsFloor ? 'border-red-400 ring-1 ring-red-400' : 'hover:border-blue-300'}`}>
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500 flex justify-between">
                                <span>{domain.id}</span>
                                {domain.meetsFloor ? <Target className="w-4 h-4 text-green-500"/> : <Lock className="w-4 h-4 text-red-500"/>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 truncate">{domain.name}</div>
                            <div className={`text-2xl font-bold ${!domain.meetsFloor ? 'text-red-600' : 'text-slate-800'}`}>
                                {formatPercent(domain.sStar)}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 flex justify-between">
                                <span>Mat: {domain.rawScore.toFixed(0)}</span>
                                <span>Cov: {(domain.coverage * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 mt-3 rounded-full overflow-hidden relative">
                                <div className="absolute top-0 bottom-0 w-0.5 bg-black z-10" style={{ left: '50%' }} title="Floor 50%" />
                                <div 
                                    className={`h-full transition-all duration-1000 ${!domain.meetsFloor ? 'bg-red-500' : 'bg-green-500'}`} 
                                    style={{ width: `${domain.sStar * 100}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* PORTFOLIO TABLE */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                            Optimized Investment Portfolio
                        </CardTitle>
                        <CardDescription>
                            Includes granular scenario mapping (Impact vs. Prob), DQI weighting, and safety caps.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-500 border-b">
                                    <tr>
                                        <th className="text-left p-3">Action</th>
                                        <th className="text-left p-3">Rationale</th>
                                        <th className="text-right p-3">Y1 Cost</th>
                                        <th className="text-right p-3 text-blue-700">NBD</th>
                                        <th className="text-right p-3 hidden sm:table-cell">ROI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {portfolio.selectedActions.map((action, idx) => (
                                        <tr key={action.id} className="border-b hover:bg-slate-50 group">
                                            <td className="p-3">
                                                <div className="font-bold text-slate-800 flex items-center gap-2">
                                                    <span className="bg-slate-200 text-slate-600 w-5 h-5 flex items-center justify-center rounded-full text-xs">{idx + 1}</span>
                                                    {action.name}
                                                </div>
                                                <div className="text-xs text-slate-500 ml-7">{action.id} • {action.resourceMonths}m • {formatCurrency(action.cost_annual)}/yr</div>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium inline-block w-fit ${
                                                    action.reason?.includes('MANDATORY') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                                }`}>
                                                    {action.reason?.includes('MANDATORY') ? 'Mandatory Floor' : 'High NBD'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-mono">{formatCurrency(action.year1Cost)}</td>
                                            <td className="p-3 text-right font-bold text-blue-700">{action.nbd.toFixed(2)}x</td>
                                            <td className="p-3 text-right text-slate-600 hidden sm:table-cell">{formatPercent(action.roi)}</td>
                                        </tr>
                                    ))}
                                    {portfolio.selectedActions.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                                No actions selected. Increase budget or adjust constraints.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="mt-4 p-4 bg-slate-50 rounded flex justify-between items-center border border-slate-200">
                            <span className="text-slate-600 text-sm">Budget Utilization (Year 1)</span>
                            <div className="text-right">
                                <div className="font-bold text-slate-800 text-lg">
                                    {formatCurrency(portfolio.totalYear1Cost)} <span className="text-slate-400 text-sm font-normal">/ {formatCurrency(budget)}</span>
                                </div>
                                <div className="w-48 bg-slate-200 h-1.5 rounded-full mt-1 ml-auto">
                                    <div 
                                        className="bg-blue-600 h-full rounded-full" 
                                        style={{ width: `${(portfolio.totalYear1Cost / budget) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CHARTS COLUMN */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Domain Performance (DQI Weighted)</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={domainChartData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                                    <XAxis type="number" domain={[0, 1]} hide />
                                    <YAxis dataKey="name" type="category" width={30} tick={{ fontSize: 12 }} />
                                    <Tooltip 
                                        formatter={(val: number) => formatPercent(val)}
                                        contentStyle={{ fontSize: '12px' }}
                                    />
                                    <ReferenceLine x={0.5} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: 'Floor', fontSize: 10, fill: 'red' }} />
                                    <Bar dataKey="Score" fill="#3b82f6" barSize={12} radius={[0, 4, 4, 0]} name="Score" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Value Creation (NBD)</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={portfolioChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip 
                                        formatter={(val: number, name) => [name === 'cost' || name === 'benefit' ? formatCurrency(val) : val.toFixed(2), name]}
                                        contentStyle={{ fontSize: '12px' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                                    <Bar dataKey="nbd" fill="#8b5cf6" name="NBD Ratio" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
      )}
      
      {activeTab === 'analysis' && (
        <div className="space-y-6 animate-in fade-in duration-500">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <List className="w-5 h-5 text-slate-500" />
                        Detailed Financial Breakdown (CFO View)
                    </CardTitle>
                    <CardDescription>
                        Validating Net Present Value (NPV) with Opex tail (3-year horizon, 10% discount).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 border-b">
                                <tr>
                                    <th className="text-left p-3">Action ID</th>
                                    <th className="text-right p-3">Upfront (Capex)</th>
                                    <th className="text-right p-3">Annual (Opex)</th>
                                    <th className="text-right p-3 font-bold">NPV (3yr)</th>
                                    <th className="text-right p-3">BCR</th>
                                    <th className="text-right p-3">Payback</th>
                                    <th className="text-right p-3">ΔALE (Annual)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.selectedActions.map((action) => (
                                    <tr key={action.id} className="border-b hover:bg-slate-50">
                                        <td className="p-3">
                                            <div className="font-medium">{action.name}</div>
                                            <div className="text-xs text-slate-400">{action.id}</div>
                                        </td>
                                        <td className="p-3 text-right">{formatCurrency(action.cost_upfront)}</td>
                                        <td className="p-3 text-right text-slate-500">{formatCurrency(action.cost_annual)}</td>
                                        <td className={`p-3 text-right font-mono ${action.npv > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(action.npv)}
                                        </td>
                                        <td className="p-3 text-right">{action.bcr.toFixed(2)}x</td>
                                        <td className="p-3 text-right">{action.paybackMonths > 100 ? '> 5yr' : `${action.paybackMonths.toFixed(1)} mo`}</td>
                                        <td className="p-3 text-right text-green-600">+{formatCurrency(action.totalDeltaALE)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-100 font-bold text-slate-700">
                                <tr>
                                    <td className="p-3">TOTALS</td>
                                    <td className="p-3 text-right">{formatCurrency(portfolio.totalUpfront)}</td>
                                    <td className="p-3 text-right">{formatCurrency(portfolio.totalAnnual)}</td>
                                    <td className="p-3 text-right text-green-700">
                                        {formatCurrency(portfolio.selectedActions.reduce((a,b) => a + b.npv, 0))}
                                    </td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
             </Card>

             <Card>
                 <CardHeader>
                     <CardTitle>Configuration Parameters</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                         <div className="p-3 bg-slate-50 rounded border">
                             <div className="text-slate-500 text-xs">Floor Threshold</div>
                             <div className="font-bold">{FLOOR_THRESHOLD * 100}%</div>
                         </div>
                         <div className="p-3 bg-slate-50 rounded border">
                             <div className="text-slate-500 text-xs">Correlation Heuristic</div>
                             <div className="font-bold">Domain-Based</div>
                             <div className="text-[10px] text-slate-400">Same: 40%, Diff: 15%</div>
                         </div>
                         <div className="p-3 bg-slate-50 rounded border">
                             <div className="text-slate-500 text-xs">Discount Rate</div>
                             <div className="font-bold">10%</div>
                         </div>
                         <div className="p-3 bg-slate-50 rounded border">
                             <div className="text-slate-500 text-xs">Year 1 Budget Cap</div>
                             <div className="font-bold">{formatCurrency(budget)}</div>
                         </div>
                     </div>
                     <div className="mt-4">
                         <label className="text-sm font-medium mb-2 block">Adjust Year 1 Budget</label>
                         <input 
                            type="range" 
                            min="200000" 
                            max="5000000" 
                            step="100000" 
                            value={budget} 
                            onChange={(e) => setBudget(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                         />
                         <div className="flex justify-between text-xs text-slate-400 mt-1">
                             <span>$200k</span>
                             <span>$5M</span>
                         </div>
                     </div>
                 </CardContent>
             </Card>
        </div>
      )}

      {activeTab === 'inputs' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            
            <div className="flex justify-center mb-6">
                <div className="bg-slate-200 p-1 rounded-lg flex gap-1">
                    <button
                        onClick={() => setInputView('kpis')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputView === 'kpis' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Domain KPIs (Inputs)
                    </button>
                    <button
                        onClick={() => setInputView('actions')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputView === 'actions' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Candidate Actions (Solutions)
                    </button>
                </div>
            </div>

            {inputView === 'kpis' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {domainScores.map((domain) => (
                            <Card key={domain.id} className="overflow-visible">
                                <CardHeader className="bg-slate-50 border-b pb-3 rounded-t-lg">
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <CardTitle className="text-base font-bold text-slate-800">{domain.id}: {domain.name}</CardTitle>
                                            <div className="text-xs text-slate-400 mt-1">
                                                Score: <span className={domain.meetsFloor ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{formatPercent(domain.sStar)}</span>
                                                {' '}(Raw: {domain.rawScore.toFixed(0)})
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-bold">Coverage</label>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    min="0" max="100" 
                                                    value={Math.round(domain.coverage * 100)}
                                                    onChange={(e) => handleCoverageChange(domain.id, parseFloat(e.target.value) / 100)}
                                                    className="w-14 p-1 border border-slate-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                                <span className="text-slate-500 text-sm">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-2">
                                        <div className="col-span-5">KPI Name</div>
                                        <div className="col-span-2 text-center">Value</div>
                                        <div className="col-span-2 text-center">Weight</div>
                                        <div className="col-span-2 text-center">DQI</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {domain.kpis.map((kpi, kpiIndex) => (
                                        <div key={kpiIndex} className="grid grid-cols-12 gap-2 items-center text-sm mb-2 group">
                                            <div className="col-span-5">
                                                <input 
                                                    type="text"
                                                    value={kpi.name}
                                                    onChange={(e) => handleKPIChange(domain.id, kpiIndex, 'name', e.target.value)}
                                                    className="w-full p-1.5 border border-slate-200 rounded focus:border-blue-400 outline-none text-slate-700 placeholder-slate-300"
                                                    placeholder="KPI Name"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input 
                                                    type="number" 
                                                    min="0" max="100"
                                                    value={kpi.value}
                                                    onChange={(e) => handleKPIChange(domain.id, kpiIndex, 'value', parseFloat(e.target.value))}
                                                    className="w-full p-1.5 border border-slate-200 rounded text-center focus:border-blue-400 outline-none"
                                                    title="Value (0-100)"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input 
                                                    type="number"
                                                    min="0" max="1" step="0.1"
                                                    value={kpi.weight}
                                                    onChange={(e) => handleKPIChange(domain.id, kpiIndex, 'weight', parseFloat(e.target.value))}
                                                    className="w-full p-1.5 border border-slate-200 rounded text-center focus:border-blue-400 outline-none"
                                                    title="Weight (0.0-1.0)"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input 
                                                    type="number"
                                                    min="0" max="1" step="0.1"
                                                    value={kpi.dqi}
                                                    onChange={(e) => handleKPIChange(domain.id, kpiIndex, 'dqi', parseFloat(e.target.value))}
                                                    className={`w-full p-1.5 border rounded text-center focus:border-blue-400 outline-none font-bold ${kpi.dqi < 0.6 ? 'border-red-200 text-red-600 bg-red-50' : 'border-slate-200'}`}
                                                    title="Data Quality Index (0.0-1.0)"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                <button 
                                                    onClick={() => handleRemoveKPI(domain.id, kpiIndex)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                                    title="Remove KPI"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {domain.kpis.length < 6 && (
                                        <button 
                                            onClick={() => handleAddKPI(domain.id)}
                                            className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-1 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors w-fit"
                                        >
                                            <Plus className="w-3 h-3" /> Add KPI
                                        </button>
                                    )}
                                    
                                    <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-2">
                                        <div className="text-xs text-slate-400">
                                            {domain.kpis.length} / 6 KPIs
                                        </div>
                                        <div className={`text-xs font-mono ${Math.abs(domain.kpis.reduce((a,b) => a + b.weight, 0) - 1.0) > 0.01 ? 'text-amber-500 font-bold' : 'text-slate-400'}`}>
                                            Total Weight: {domain.kpis.reduce((a,b) => a + b.weight, 0).toFixed(2)}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    
                    <Card className="bg-slate-50 border-dashed border-2">
                        <CardContent className="flex flex-col items-center justify-center py-8 text-slate-400">
                            <Edit2 className="w-8 h-8 mb-3 text-slate-300" />
                            <p className="text-center max-w-lg text-sm">
                                Adjusting KPI values or weights triggers the recompute. Low DQI metrics (e.g. 0.5) contribute less to the domain score, forcing higher "S*" requirements to meet the 0.50 floor.
                            </p>
                        </CardContent>
                    </Card>
                </>
            )}

            {inputView === 'actions' && (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-blue-600" />
                                Investment Candidates (Portfolio Projects)
                            </CardTitle>
                            <CardDescription>
                                These are the potential solutions the calculator evaluates. Edit costs or mappings to reflect your actual project proposals.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 border-b">
                                        <tr>
                                            <th className="text-left p-3 w-16">ID</th>
                                            <th className="text-left p-3">Project Name</th>
                                            <th className="text-left p-3 w-32">Target Domain</th>
                                            <th className="text-right p-3 w-32">Upfront (Capex)</th>
                                            <th className="text-right p-3 w-32">Annual (Opex)</th>
                                            <th className="text-center p-3 w-24">Floor Fix?</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {actions.map((action) => (
                                            <tr key={action.id} className="group hover:bg-slate-50">
                                                <td className="p-3 font-mono text-slate-500">{action.id}</td>
                                                <td className="p-3">
                                                    <input 
                                                        type="text"
                                                        value={action.name}
                                                        onChange={(e) => handleActionChange(action.id, 'name', e.target.value)}
                                                        className="w-full p-2 border border-slate-200 rounded focus:border-blue-500 outline-none bg-transparent"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <select
                                                        value={action.domainId}
                                                        onChange={(e) => handleActionChange(action.id, 'domainId', e.target.value)}
                                                        className="w-full p-2 border border-slate-200 rounded focus:border-blue-500 outline-none bg-transparent"
                                                    >
                                                        {DEFAULT_DOMAINS.map(d => (
                                                            <option key={d.id} value={d.id}>{d.id} ({d.name})</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="p-3">
                                                    <input 
                                                        type="number"
                                                        value={action.cost_upfront}
                                                        onChange={(e) => handleActionChange(action.id, 'cost_upfront', parseFloat(e.target.value))}
                                                        className="w-full p-2 border border-slate-200 rounded text-right focus:border-blue-500 outline-none bg-transparent font-mono"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input 
                                                        type="number"
                                                        value={action.cost_annual}
                                                        onChange={(e) => handleActionChange(action.id, 'cost_annual', parseFloat(e.target.value))}
                                                        className="w-full p-2 border border-slate-200 rounded text-right focus:border-blue-500 outline-none bg-transparent font-mono"
                                                    />
                                                </td>
                                                <td className="p-3 text-center">
                                                    <input 
                                                        type="checkbox"
                                                        checked={action.isFloorFix}
                                                        onChange={(e) => handleActionChange(action.id, 'isFloorFix', e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <Alert className="bg-blue-50 border-blue-200">
                        <div className="flex gap-3">
                            <div className="mt-1"><Target className="h-4 w-4 text-blue-600" /></div>
                            <div>
                                <AlertTitle className="text-blue-800">Why does this list matter?</AlertTitle>
                                <AlertDescription className="text-blue-700">
                                    The STIDA calculator requires two things: <strong>Problems</strong> (Your KPIs) and <strong>Solutions</strong> (these Actions). 
                                    If a domain score is low, the engine looks here for a project mapped to that domain. 
                                    If you see a project calculated that you don't recognize (like "Identity Overhaul"), it's because it was in this default list.
                                </AlertDescription>
                            </div>
                        </div>
                    </Alert>
                </div>
            )}
        </div>
      )}

      <div className="text-center text-xs text-slate-400 mt-8 pb-8">
        STIDA v4.1 + DQI: DQI Weighted Scoring • Risk Reduction Caps • Independent Scoring • Floor (0.50)
      </div>
    </div>
  );
};

export default STIDACalculator;