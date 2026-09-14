"use client";

import { useState } from "react";

type BudgetResult = {
  grossSubmissions: number;
  approvedSubmissions: number;
  contributorPayout: number;
  reviewerCost: number;
  platformFee: number;
  total: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function DataBudgetCalculator() {
  const [targetApproved, setTargetApproved] = useState(1000);
  const [pricePerSubmission, setPricePerSubmission] = useState(3);
  const [rejectionRate, setRejectionRate] = useState(20);
  const [reviewMinutes, setReviewMinutes] = useState(2);
  const [reviewerHourlyRate, setReviewerHourlyRate] = useState(18);

  const grossSubmissions = Math.ceil(targetApproved / (1 - rejectionRate / 100));
  const approvedSubmissions = targetApproved;
  const contributorPayout = grossSubmissions * pricePerSubmission;
  const totalReviewMinutes = grossSubmissions * reviewMinutes;
  const reviewerCost = (totalReviewMinutes / 60) * reviewerHourlyRate;
  const platformFee = contributorPayout * 0.1;
  const total = contributorPayout + reviewerCost + platformFee;

  const result: BudgetResult = {
    grossSubmissions,
    approvedSubmissions,
    contributorPayout,
    reviewerCost,
    platformFee,
    total,
  };

  return (
    <div className="my-10 rounded-xl border border-black/[0.08] bg-background shadow-xs overflow-hidden">
      <div className="border-b border-black/[0.08] px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Interactive tool
        </p>
        <h3 className="mt-1 text-xl font-normal text-black">
          Dataset collection budget estimator
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
        {/* Inputs */}
        <div className="border-b border-black/[0.08] px-6 py-6 md:border-b-0 md:border-r md:border-black/[0.08]">
          <p className="mb-6 text-xs font-medium uppercase tracking-widest text-gray-400">
            Parameters
          </p>
          <div className="space-y-6">
            <SliderField
              label="Target approved submissions"
              value={targetApproved}
              min={100}
              max={10000}
              step={100}
              format={(v) => v.toLocaleString()}
              onChange={setTargetApproved}
            />
            <SliderField
              label="Payout per submission (USD)"
              value={pricePerSubmission}
              min={0.5}
              max={20}
              step={0.5}
              format={(v) => `$${v.toFixed(2)}`}
              onChange={setPricePerSubmission}
            />
            <SliderField
              label="Expected rejection rate"
              value={rejectionRate}
              min={5}
              max={60}
              step={5}
              format={(v) => `${v}%`}
              onChange={setRejectionRate}
            />
            <SliderField
              label="Review time per submission (min)"
              value={reviewMinutes}
              min={0.5}
              max={15}
              step={0.5}
              format={(v) => `${v} min`}
              onChange={setReviewMinutes}
            />
            <SliderField
              label="Reviewer hourly rate (USD)"
              value={reviewerHourlyRate}
              min={10}
              max={60}
              step={2}
              format={(v) => `$${v}/hr`}
              onChange={setReviewerHourlyRate}
            />
          </div>
        </div>

        {/* Output */}
        <div className="px-6 py-6">
          <p className="mb-6 text-xs font-medium uppercase tracking-widest text-gray-400">
            Estimated budget
          </p>
          <div className="space-y-3">
            <ResultRow
              label="Gross submissions needed"
              value={result.grossSubmissions.toLocaleString()}
              sub={`to get ${result.approvedSubmissions.toLocaleString()} approved`}
            />
            <div className="border-t border-black/[0.08] pt-3" />
            <ResultRow
              label="Contributor payouts"
              value={formatCurrency(result.contributorPayout)}
            />
            <ResultRow
              label="Reviewer labor"
              value={formatCurrency(result.reviewerCost)}
            />
            <ResultRow
              label="Platform fee (est. 10%)"
              value={formatCurrency(result.platformFee)}
              muted
            />
            <div className="border-t border-black pt-4 mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium uppercase tracking-widest text-black">
                  Total estimate
                </span>
                <span className="text-2xl font-normal text-black">
                  {formatCurrency(result.total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {formatCurrency(result.total / result.approvedSubmissions)} per approved submission
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm text-gray-600">{label}</label>
        <span className="text-sm font-medium text-black tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-px w-full cursor-pointer appearance-none bg-gray-200 accent-black"
      />
    </div>
  );
}

function ResultRow({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className={`text-sm ${muted ? "text-gray-400" : "text-gray-600"}`}>
          {label}
        </span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <span className={`text-sm tabular-nums ${muted ? "text-gray-400" : "text-black"}`}>
        {value}
      </span>
    </div>
  );
}
