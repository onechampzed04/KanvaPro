import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-4 text-xl text-gray-600">
          Choose the plan that's right for you and your team.
        </p>
      </div>

      <div className="mt-16 grid gap-8 lg:grid-cols-3 max-w-7xl mx-auto">
        {/* Free Plan */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
          <h3 className="text-xl font-semibold text-gray-900">Free</h3>
          <p className="mt-4 text-gray-500">For individuals just getting started.</p>
          <div className="mt-6">
            <span className="text-4xl font-extrabold text-gray-900">$0</span>
            <span className="text-base font-medium text-gray-500">/mo</span>
          </div>
          <ul className="mt-6 space-y-4 flex-1">
            {['250,000+ free templates', '100+ design types', '1M+ free photos and graphics', '5GB of cloud storage'].map((feature) => (
              <li key={feature} className="flex items-start">
                <Check className="h-5 w-5 text-green-500 shrink-0" />
                <span className="ml-3 text-gray-600">{feature}</span>
              </li>
            ))}
          </ul>
          <Link to="/register" className="mt-8 block w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold py-3 px-6 rounded-lg text-center transition">
            Get Started
          </Link>
        </div>

        {/* Pro Plan */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-600 p-8 flex flex-col relative transform scale-105 z-10">
          <div className="absolute top-0 right-0 -mt-4 mr-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
            Most Popular
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Pro</h3>
          <p className="mt-4 text-gray-500">For individuals who want unlimited access.</p>
          <div className="mt-6">
            <span className="text-4xl font-extrabold text-gray-900">$12.99</span>
            <span className="text-base font-medium text-gray-500">/mo</span>
          </div>
          <ul className="mt-6 space-y-4 flex-1">
            {['Everything in Free', '100M+ premium stock photos', 'Remove backgrounds instantly', '1TB of cloud storage', 'Resize designs magically'].map((feature) => (
              <li key={feature} className="flex items-start">
                <Check className="h-5 w-5 text-indigo-600 shrink-0" />
                <span className="ml-3 text-gray-600">{feature}</span>
              </li>
            ))}
          </ul>
          <button className="mt-8 block w-full bg-indigo-600 text-white hover:bg-indigo-700 font-semibold py-3 px-6 rounded-lg text-center transition shadow-lg">
            Try Pro for Free
          </button>
        </div>

        {/* Enterprise Plan */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
          <h3 className="text-xl font-semibold text-gray-900">Enterprise</h3>
          <p className="mt-4 text-gray-500">For large teams and organizations.</p>
          <div className="mt-6">
            <span className="text-4xl font-extrabold text-gray-900">$30.00</span>
            <span className="text-base font-medium text-gray-500">/mo per person</span>
          </div>
          <ul className="mt-6 space-y-4 flex-1">
            {['Everything in Pro', 'SSO & Enterprise security', 'Unlimited storage', '24/7 Priority support', 'Advanced team controls'].map((feature) => (
              <li key={feature} className="flex items-start">
                <Check className="h-5 w-5 text-green-500 shrink-0" />
                <span className="ml-3 text-gray-600">{feature}</span>
              </li>
            ))}
          </ul>
          <button className="mt-8 block w-full bg-gray-800 text-white hover:bg-gray-900 font-semibold py-3 px-6 rounded-lg text-center transition">
            Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}
