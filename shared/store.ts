export type Address = {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pin: string;
};

export type Customer = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  upiId: string | null;
  address: Address | null;
  operator: boolean;
};

export type OrderLine = {
  id: string;
  title: string;
  format: string;
  quantity: number;
  unitPrice: number;
  components?: { id: string; title: string; format: string }[];
};

export const orderStatusLabels = {
  submitted: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled'
} as const;

export type OrderStatus = keyof typeof orderStatusLabels;

export type Order = {
  id: string;
  status: OrderStatus;
  createdAt: string;
  lines: OrderLine[];
  estimatedSubtotal: number;
  couponCode: string | null;
  discount: number;
  address: Address | null;
  finalTotal: number | null;
  paidAt: string | null;
  paymentLinkId: string | null;
  refundedAt: string | null;
};

export type Ebook = { id: string; title: string; available: boolean };
export type Review = { id: string; bookId: string; title?: string; reviewer: string; rating: number; comment: string; approved: boolean };
export type BulkDetails = { quantity: number; city: string; neededBy: string | null };

export type Coupon = { code: string; percent: number; active: boolean };

export function couponDiscount(subtotal: number, percent: number) {
  return Math.floor(subtotal * percent / 100);
}

export type StoreNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  bookId: string | null;
  orderId: string | null;
  read: boolean;
};

export type StoreOrder = Order & { email: string; fullName: string };

export type EnquiryEmailStatus = 'accepted' | 'failed' | 'unconfirmed';
export type Enquiry = {
  id: string;
  fullName: string;
  email: string;
  message: string;
  createdAt: string;
  emailStatus: EnquiryEmailStatus | null;
  bulkDetails: BulkDetails | null;
};

export type EnquirySettings = { recipient: string; mailConfigured: boolean };

export type PublisherOverview = {
  publishedBooks: number;
  pendingOrders: number;
  lowStockBooks: number;
  enquiries: number;
  recentOrders: (Pick<Order, 'id' | 'status' | 'createdAt' | 'estimatedSubtotal'> & { fullName: string })[];
  stockAlerts: { id: string; title: string; stock: number }[];
};

export function nextOrderStatuses(order: Pick<Order, 'status' | 'address'>): OrderStatus[] {
  switch (order.status) {
    case 'submitted': return ['confirmed', 'cancelled'];
    case 'confirmed': return [order.address ? 'shipped' : 'completed', 'cancelled'];
    case 'shipped': return ['completed'];
    default: return [];
  }
}
