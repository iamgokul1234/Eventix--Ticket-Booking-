import React, { useState, useEffect, useCallback } from 'react';
import { walletApi } from '../services/api';
import { WalletTransaction } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatPaiseToRupees, formatDateTime, getStatusBadgeClass } from '../utils/formatters';
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, History, Loader2, Sparkles } from 'lucide-react';

export const WalletPage: React.FC = () => {
  const { user, updateWalletBalance } = useAuth();
  const toast = useToast();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTopUpLoading, setIsTopUpLoading] = useState<boolean>(false);
  const [customRupees, setCustomRupees] = useState<string>('');

  const fetchWalletData = useCallback(async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(),
      ]);

      if (balRes.success) {
        const bal = balRes.data.walletBalance ?? balRes.data.balance ?? 0;
        updateWalletBalance(bal);
      }
      if (txRes.success && txRes.data.transactions) {
        setTransactions(txRes.data.transactions);
      }
    } catch (err) {
      console.error('Error loading wallet data:', err);
      toast.error('Failed to load wallet information');
    } finally {
      setIsLoading(false);
    }
  }, [toast, updateWalletBalance]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleTopUp = async (amountPaise: number) => {
    if (amountPaise <= 0) {
      toast.error('Invalid Amount', 'Top-up amount must be greater than 0');
      return;
    }

    setIsTopUpLoading(true);
    try {
      const res = await walletApi.topUp(amountPaise);
      if (res.success) {
        toast.success(
          'Wallet Credited!',
          `Added ${formatPaiseToRupees(amountPaise)} to your wallet balance.`
        );
        updateWalletBalance(res.data.newBalance);
        setCustomRupees('');
        await fetchWalletData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Top-Up Failed', msg || 'Failed to top up wallet balance');
    } finally {
      setIsTopUpLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
        <p className="text-sm">Loading wallet ledger...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Section: Balance Card & Quick Top-Up Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Balance Display Card */}
          <div className="lg:col-span-1 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 p-6 sm:p-8 rounded-3xl border border-emerald-500/30 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
              <Wallet className="w-32 h-32 text-emerald-400" />
            </div>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                <span>In-App Digital Wallet</span>
              </div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Available Balance</div>
              <div className="text-4xl font-extrabold text-white mt-1">
                {formatPaiseToRupees(user?.walletBalance || 0)}
              </div>
            </div>

            <div className="pt-8 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
              <span>Account Holder</span>
              <span className="font-semibold text-slate-200">{user?.name}</span>
            </div>
          </div>

          {/* Quick Top-Up Action Panel */}
          <div className="lg:col-span-2 bg-slate-900/60 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Top-Up Wallet Balance</h2>
              <p className="text-xs text-slate-400 mb-6">
                Instantly credit your wallet for seamless high-speed event ticket checkout
              </p>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: '₹500', paise: 50000 },
                  { label: '₹1,000', paise: 100000 },
                  { label: '₹2,000', paise: 200000 },
                  { label: '₹5,000', paise: 500000 },
                ].map((preset) => (
                  <button
                    key={preset.paise}
                    disabled={isTopUpLoading}
                    onClick={() => handleTopUp(preset.paise)}
                    className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-emerald-600/20 hover:border-emerald-500/40 text-slate-200 hover:text-emerald-300 border border-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom Input Top-Up */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-xs font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    placeholder="Enter custom amount in Rupees"
                    value={customRupees}
                    onChange={(e) => setCustomRupees(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  disabled={isTopUpLoading || !customRupees}
                  onClick={() => handleTopUp(Math.floor(parseFloat(customRupees || '0') * 100))}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isTopUpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Top-Up</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Append-Only Ledger Transaction History Table */}
        <div className="bg-slate-900/60 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Append-Only Wallet Ledger</h3>
                <p className="text-xs text-slate-400">Complete immutable log of all balance debits and credits</p>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              {transactions.length} Records
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No transactions recorded yet.
            </div>
          ) : (
            <>
              {/* Mobile Card List (visible on screens < md) */}
              <div className="block md:hidden space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx._id}
                    className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${getStatusBadgeClass(
                          tx.type
                        )}`}
                      >
                        {tx.type === 'CREDIT' ? (
                          <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-rose-400" />
                        )}
                        <span>{tx.type}</span>
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.type === 'CREDIT' ? '+' : '-'}
                        {formatPaiseToRupees(tx.amount)}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400 text-[11px] pt-1">
                      <span>Date: {formatDateTime(tx.createdAt)}</span>
                      <span className="font-mono text-violet-400">{tx.referenceType}</span>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                      <span>Before: {formatPaiseToRupees(tx.balanceBefore)}</span>
                      <span className="font-semibold text-slate-200">
                        After: {formatPaiseToRupees(tx.balanceAfter)}
                      </span>
                    </div>
                    {tx.description && (
                      <div className="text-[11px] text-slate-400 italic pt-1">{tx.description}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View (visible on screens >= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Balance Before</th>
                      <th className="py-3 px-4">Balance After</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${getStatusBadgeClass(
                              tx.type
                            )}`}
                          >
                            {tx.type === 'CREDIT' ? (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-rose-400" />
                            )}
                            <span>{tx.type}</span>
                          </span>
                        </td>
                        <td
                          className={`py-3.5 px-4 font-bold ${
                            tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {tx.type === 'CREDIT' ? '+' : '-'}
                          {formatPaiseToRupees(tx.amount)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {formatPaiseToRupees(tx.balanceBefore)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-200 font-semibold">
                          {formatPaiseToRupees(tx.balanceAfter)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-violet-400">
                          {tx.referenceType}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{tx.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
