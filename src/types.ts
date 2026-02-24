import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Client = {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  created_at: string;
};

export type Opportunity = {
  id: number;
  title: string;
  client_id: number;
  client_name?: string;
  value: number;
  status: 'lead' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  description: string;
  created_at: string;
};

export type Project = {
  id: number;
  name: string;
  client_id: number;
  client_name?: string;
  status: 'active' | 'completed' | 'on_hold';
  budget: number;
  deadline: string;
  created_at: string;
};

export type Transaction = {
  id: number;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  is_recurring: boolean;
  created_at: string;
};
