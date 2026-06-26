// frontend/src/components/dashboard/TokenPurchaseModal.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ShoppingCart, Sparkles, Check, Loader2 } from 'lucide-react';

interface TokenPackage {
  id: string;
  name: string;
  price: number;
  token_amount: number;
  description: string;
}

interface Props {
  onClose: () => void;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

export default function TokenPurchaseModal({ onClose }: Props) {
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const res = await fetch('/api/ai/packages', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) throw new Error('Load failed');
        const data = await res.json();
        setPackages(data.packages || []);
        if (data.packages?.length > 0) {
          const midIdx = Math.floor(data.packages.length / 2);
          setSelectedId(data.packages[midIdx].id);
        }
      } catch (e: any) {
        setError(e.message || 'Error loading packages');
      } finally {
        setLoadingPackages(false);
      }
    };
    fetchPackages();
  }, []);

  const handleCheckout = async () => {
    if (!selectedId || isCheckingOut) return;
    setIsCheckingOut(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/create-token-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include',
        body: JSON.stringify({ packageId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cannot create payment link');
      window.location.href = data.checkoutUrl;
    } catch (e: any) {
      setError(e.message || 'Payment error');
      setIsCheckingOut(false);
    }
  };

  const selectedPkg = packages.find((p) => p.id === selectedId);
  const unitPrice = selectedPkg ? Math.round(selectedPkg.price / selectedPkg.token_amount) : 0;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.9, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 24 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Gradient Header */}
          <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 text-white overflow-hidden">
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5" />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition text-white"
            >
              <X size={15} />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Zap size={18} className="text-yellow-300" fill="currentColor" />
              </div>
              <div>
                <h2 className="font-extrabold text-lg leading-tight">Mua Token AI</h2>
                <p className="text-white/70 text-xs font-medium">Tao anh bang Vertex AI Imagen 3</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 text-[11px] font-semibold text-white/80">
              <Sparkles size={12} className="text-yellow-300" />
              Moi token = 1 lan tao anh AI chat luong cao
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {loadingPackages ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 size={28} className="text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Loading packages...</p>
              </div>
            ) : packages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm">No packages available. Please try again later.</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Select a package
                </p>

                <div className="flex flex-col gap-3 mb-5">
                  {packages.map((pkg, index) => {
                    const isSelected = selectedId === pkg.id;
                    const perToken = Math.round(pkg.price / pkg.token_amount);
                    const isPopular = packages.length > 1 && index === Math.floor(packages.length / 2);

                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedId(pkg.id)}
                        className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                      >
                        {isPopular && (
                          <span className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-gradient-to-r from-orange-400 to-pink-500 text-white text-[10px] font-extrabold rounded-full shadow">
                            Popular
                          </span>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                            }`}>
                              {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-800 text-sm">{pkg.name}</p>
                              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                {perToken.toLocaleString('vi-VN')}d / token
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg font-black text-indigo-600">
                                {pkg.token_amount}
                              </span>
                              <span className="text-xs font-bold text-slate-400">tokens</span>
                            </div>
                            <p className="text-xs font-bold text-slate-600">{formatPrice(pkg.price)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Price summary */}
                {selectedPkg && (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-xs font-bold text-slate-600">
                    <span>{selectedPkg.token_amount} tokens x {unitPrice.toLocaleString('vi-VN')}d</span>
                    <span className="text-indigo-700 text-sm">{formatPrice(selectedPkg.price)}</span>
                  </div>
                )}

                {error && (
                  <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700">
                    {error}
                  </div>
                )}

                {/* CTA Button */}
                <button
                  onClick={handleCheckout}
                  disabled={!selectedId || isCheckingOut}
                  className={`w-full py-3.5 rounded-2xl font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg transition-all duration-200 ${
                    !selectedId || isCheckingOut
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating payment link...
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={16} />
                      Pay via PayOS
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-slate-400 font-medium mt-3">
                  Secure payment via PayOS. Tokens credited instantly after payment.
                </p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
