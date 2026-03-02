"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VAT_RATES, euro } from "@/lib/utils/invoice";
import type { DocumentLine, VatRate } from "@/types";

interface LineItemsTableProps {
  lines: DocumentLine[];
  onChange: (lines: DocumentLine[]) => void;
}

export function LineItemsTable({ lines, onChange }: LineItemsTableProps) {
  const updateLine = <K extends keyof DocumentLine>(
    index: number,
    key: K,
    value: DocumentLine[K],
  ) => {
    const next = lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
    onChange(next);
  };

  const addLine = () => {
    onChange([
      ...lines,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        vat_rate: 20,
        position: lines.length,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) {
      onChange([{ ...lines[0], description: "", quantity: 1, unit_price: 0, vat_rate: 20 }]);
      return;
    }
    onChange(lines.filter((_, i) => i !== index).map((line, i) => ({ ...line, position: i })));
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Qté</th>
              <th className="px-3 py-2">PU HT</th>
              <th className="px-3 py-2">TVA%</th>
              <th className="px-3 py-2">Total HT</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const lineTotal = Number(line.quantity || 0) * Number(line.unit_price || 0);
              return (
                <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <Input
                      value={line.description}
                      placeholder="Prestation"
                      onChange={(e) => updateLine(index, "description", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, "quantity", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) => updateLine(index, "unit_price", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={String(line.vat_rate)}
                      onChange={(e) => updateLine(index, "vat_rate", Number(e.target.value) as VatRate)}
                    >
                      {VAT_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 font-medium">{euro(lineTotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(index)}>
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" onClick={addLine}>
        <Plus size={14} className="mr-2" />
        Ajouter une ligne
      </Button>
    </div>
  );
}
