import { sendToRole, sendToUser, SendNotificationOptions } from './push'

async function notify(roles: string[], payload: SendNotificationOptions) {
  const results = await Promise.allSettled(roles.map(role => sendToRole(role, payload)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[Notify] Role ${roles[i]} failed:`, result.reason)
    } else if (result.value.failed > 0) {
      console.warn(`[Notify] Role ${roles[i]}: ${result.value.failed} of ${result.value.total} failed`)
    }
  })
  return results
}

// ─── Driver ──────────────────────────────────────────────

export function notifyDriverFuelRequest(plateNumber: string) {
  return notify(['Driver'], {
    title: 'Fuel Request',
    body: `You have a new fuel request for ${plateNumber}. Tap to view details.`,
    url: '/driver',
  })
}

export function notifyDriverStopReminder() {
  return notify(['Driver'], {
    title: 'Stop Recording Reminder',
    body: "You haven't recorded your stops in a while. Tap to log your stop.",
    url: '/driver',
    tag: 'stop-reminder',
  })
}

// ─── Broker ──────────────────────────────────────────────

export function notifyBrokerNewTripStarted(tripId: string, materialCentre: string) {
  return notify(['Broker'], {
    title: 'New Trip Started',
    body: `Trip started — ${materialCentre}. Tap to view details.`,
    url: '/admin?section=monitor-trips',
    tag: `trip-${tripId}`,
  })
}

export function notifyBrokerPendingStop(brokerId: string, plateNumber: string) {
  return sendToUser(brokerId, {
    title: 'Pending Stop Confirmation',
    body: `You have a pending stop for ${plateNumber}. Tap to confirm.`,
    url: '/admin?section=complaints',
    tag: `stop-pending-${brokerId}`,
  })
}

export function notifyBrokerStopReminder(brokerId: string, plateNumber: string) {
  return sendToUser(brokerId, {
    title: 'Stop Confirmation Reminder',
    body: `Stop for ${plateNumber} still unconfirmed after 6 hours. Tap to confirm.`,
    url: '/admin?section=complaints',
    tag: `stop-reminder-${brokerId}`,
  })
}

export function notifyBrokerStopResolved(brokerId: string, plateNumber: string) {
  return sendToUser(brokerId, {
    title: 'Disputed Stop Resolved',
    body: `Disputed stop for ${plateNumber} has been resolved. Tap to view.`,
    url: '/admin?section=complaints',
    tag: `stop-resolved-${brokerId}`,
  })
}

export function notifyBrokerPaymentPosted(brokerId: string, customerName: string, amount: number) {
  return sendToUser(brokerId, {
    title: 'Customer Payment Posted',
    body: `₦${amount.toLocaleString()} payment from ${customerName} has been posted.`,
    url: '/admin?section=customer-payments',
    tag: `payment-posted-${brokerId}`,
  })
}

export function notifyBrokerCreditExceeded15Days(brokerId: string, customerName: string) {
  return sendToUser(brokerId, {
    title: 'Credit Days Exceeded',
    body: `Credit for ${customerName} has exceeded 15 days. Tap to review.`,
    url: '/admin?section=credit',
    tag: `credit-days-${brokerId}`,
  })
}

export function notifyBrokerCreditLimitExceeded(brokerId: string, customerName: string) {
  return sendToUser(brokerId, {
    title: 'Credit Limit Exceeded',
    body: `Credit limit exceeded for ${customerName}. Tap to review.`,
    url: '/admin?section=credit',
    tag: `credit-limit-${brokerId}`,
  })
}

export function notifyBrokerCreditUpdated(brokerId: string, customerName: string) {
  return sendToUser(brokerId, {
    title: 'Credit Updated',
    body: `Your credit has been updated for ${customerName}. Tap to view.`,
    url: '/admin?section=credit',
    tag: `credit-updated-${brokerId}`,
  })
}

export function notifyBrokerPendingStoreSale(brokerId: string, storeName: string) {
  return sendToUser(brokerId, {
    title: 'Pending Store Sale',
    body: `You have a pending store sale at ${storeName}. Tap to confirm.`,
    url: '/admin?section=store-sales',
    tag: `sale-pending-${brokerId}`,
  })
}

export function notifyBrokerStoreSaleReminder(brokerId: string, storeName: string) {
  return sendToUser(brokerId, {
    title: 'Store Sale Confirmation Reminder',
    body: `Store sale at ${storeName} still unconfirmed after 6 hours. Tap to confirm.`,
    url: '/admin?section=store-sales',
    tag: `sale-reminder-${brokerId}`,
  })
}

export function notifyBrokerPricesUpdated() {
  return notify(['Broker'], {
    title: 'Company Prices Updated',
    body: 'Company prices have been updated. Tap to view the latest prices.',
    url: '/admin?section=company-prices',
    tag: 'prices-updated',
  })
}

export function notifyBrokerRouteSet(tripId: string, plateNumber: string) {
  return notify(['Broker'], {
    title: 'Truck Route Set',
    body: `Route has been set for trip ${tripId} (${plateNumber}). Tap to view.`,
    url: '/admin?section=monitor-trips',
    tag: `route-set-${tripId}`,
  })
}

// ─── TruckAdmin ──────────────────────────────────────────

export function notifyTruckAdminNewMaintenanceReport(reportId: string, plateNumber: string, maintenanceType: string) {
  return notify(['TruckAdmin'], {
    title: 'New Maintenance Report',
    body: `Maintenance report submitted — ${plateNumber}, ${maintenanceType}. Tap to review.`,
    url: '/truck-admin',
    tag: `maintenance-${reportId}`,
  })
}

export function notifyTruckAdminMaintenanceReportActioned(reportId: string, plateNumber: string, status: string) {
  return notify(['TruckAdmin'], {
    title: 'Maintenance Report Actioned',
    body: `Maintenance report for ${plateNumber} has been ${status.toLowerCase()}. Tap to view.`,
    url: '/truck-admin',
    tag: `maintenance-actioned-${reportId}`,
  })
}

export function notifyTruckAdminNewATFRequest(requestId: string, plateNumber: string) {
  return notify(['TruckAdmin'], {
    title: 'New ATF Request',
    body: `Fuel request pending — ${plateNumber}. Tap to authorise.`,
    url: '/truck-admin',
    tag: `atf-${requestId}`,
  })
}

export function notifyTruckAdminATFRequestActioned(requestId: string, plateNumber: string, status: string) {
  return notify(['TruckAdmin'], {
    title: 'ATF Request Actioned',
    body: `Fuel request for ${plateNumber} has been ${status.toLowerCase()}. Tap to view.`,
    url: '/truck-admin',
    tag: `atf-actioned-${requestId}`,
  })
}

export function notifyTruckAdminNewSideTrip(driverName: string, plateNumber: string) {
  return notify(['TruckAdmin'], {
    title: 'New Side Trip',
    body: `Side trip submitted by ${driverName} (${plateNumber}). Tap to review.`,
    url: '/truck-admin',
    tag: `side-trip-${driverName}`,
  })
}

export function notifyTruckAdminDepositMade(amount: number) {
  return notify(['TruckAdmin'], {
    title: 'Deposit Made',
    body: `₦${amount.toLocaleString()} deposit made to maintenance account. Tap to view.`,
    url: '/truck-admin',
    tag: 'deposit-made',
  })
}

export function notifyTruckAdminDieselAlert(plateNumber: string) {
  return notify(['TruckAdmin'], {
    title: 'Diesel Consumption Alert',
    body: `Diesel consumption report flagged for ${plateNumber}. Tap to review.`,
    url: '/truck-admin',
    tag: `diesel-${plateNumber}`,
  })
}

// ─── TruckOfficer ────────────────────────────────────────

export function notifyTruckOfficerReportActioned(reportId: string, plateNumber: string, status: string) {
  return notify(['TruckOfficer'], {
    title: 'Maintenance Report Actioned',
    body: `Your maintenance report for ${plateNumber} has been ${status.toLowerCase()}. Tap to view.`,
    url: '/truck-officer',
    tag: `report-actioned-${reportId}`,
  })
}

export function notifyTruckOfficerATFActioned(requestId: string, plateNumber: string, status: string) {
  return notify(['TruckOfficer'], {
    title: 'ATF Request Actioned',
    body: `Your fuel request for ${plateNumber} has been ${status.toLowerCase()}. Tap to view.`,
    url: '/truck-officer',
    tag: `atf-actioned-${requestId}`,
  })
}

export function notifyTruckOfficerTruckStatusChange(plateNumber: string, newStatus: string) {
  return notify(['TruckOfficer'], {
    title: 'Truck Status Change',
    body: `Truck ${plateNumber} status changed to ${newStatus}. Tap to view.`,
    url: '/truck-officer',
    tag: `truck-status-${plateNumber}`,
  })
}

// ─── StationManager ──────────────────────────────────────

export function notifyStationManagerNewATFRequest(requestId: string, plateNumber: string, litres: number) {
  return notify(['StationManager'], {
    title: 'New Fuel Request',
    body: `${plateNumber} — ${litres}L waiting to be dispensed. Tap to dispense.`,
    url: '/station-manager',
    tag: `atf-dispense-${requestId}`,
  })
}

export function notifyStationManagerATFConfirmed(requestId: string, plateNumber: string) {
  return notify(['StationManager'], {
    title: 'Dispensation Confirmed',
    body: `Fuel dispensation for ${plateNumber} confirmed by driver. Tap to view.`,
    url: '/station-manager',
    tag: `atf-confirmed-${requestId}`,
  })
}

export function notifyStationManagerATFInvalidated(requestId: string, plateNumber: string, reason: string) {
  return notify(['StationManager'], {
    title: 'ATF Request Invalidated',
    body: `Fuel request for ${plateNumber} invalidated — ${reason}. Tap to view.`,
    url: '/station-manager',
    tag: `atf-invalidated-${requestId}`,
  })
}

export function notifyStationManagerNewDeposit(amount: number) {
  return notify(['StationManager'], {
    title: 'New Deposit to Confirm',
    body: `₦${amount.toLocaleString()} deposit needs confirmation. Tap to confirm.`,
    url: '/station-manager',
    tag: 'deposit-confirm',
  })
}

export function notifyStationManagerLowFuel(balance: number) {
  return notify(['StationManager'], {
    title: 'Low Fuel Balance',
    body: `Fuel balance is low — ${balance}L remaining. Tap to view.`,
    url: '/station-manager',
    tag: 'low-fuel',
  })
}

// ─── StoreOfficer ────────────────────────────────────────

export function notifyStoreOfficerIncomingDelivery(tripId: string, product: string) {
  return notify(['StoreOfficer'], {
    title: 'Incoming Delivery',
    body: `Truck arriving with ${product}. Tap to prepare offloading.`,
    url: '/store-officer',
    tag: `delivery-${tripId}`,
  })
}

export function notifyStoreOfficerSaleRejected(saleId: string, reason: string) {
  return notify(['StoreOfficer'], {
    title: 'Sale Rejected',
    body: `Sale rejected — ${reason}. Tap to view and redo.`,
    url: '/store-officer',
    tag: `sale-rejected-${saleId}`,
  })
}

export function notifyStoreOfficerSaleConfirmed(saleId: string) {
  return notify(['StoreOfficer'], {
    title: 'Sale Confirmed',
    body: `Your sale has been confirmed. Tap to view details.`,
    url: '/store-officer',
    tag: `sale-confirmed-${saleId}`,
  })
}

export function notifyStoreOfficerPendingBrokerSale(storeName: string) {
  return notify(['StoreOfficer'], {
    title: 'Pending Broker Sale',
    body: `Broker-linked sale pending at ${storeName}. Tap to confirm.`,
    url: '/store-officer',
    tag: `broker-sale-${storeName}`,
  })
}

export function notifyStoreOfficerInventoryDiscrepancy(product: string, discrepancy: number) {
  return notify(['StoreOfficer'], {
    title: 'Inventory Discrepancy',
    body: `Discrepancy found — ${product}: ${discrepancy} units unaccounted. Tap to review.`,
    url: '/store-officer',
    tag: `discrepancy-${product}`,
  })
}

// ─── StoreSupervisor ─────────────────────────────────────

export function notifyStoreSupervisorSaleRejected(saleId: string, officerName: string, reason: string) {
  return notify(['StoreSupervisor'], {
    title: 'Sale Rejected — Officer Action Needed',
    body: `Sale by ${officerName} rejected — ${reason}. Tap to review.`,
    url: '/store-supervisor',
    tag: `sale-rejected-sup-${saleId}`,
  })
}

export function notifyStoreSupervisorPendingBrokerSale(storeName: string, brokerName: string) {
  return notify(['StoreSupervisor'], {
    title: 'Pending Broker Sale Logged',
    body: `Broker sale at ${storeName} (${brokerName}) pending confirmation. Tap to view.`,
    url: '/store-supervisor',
    tag: `broker-sale-sup-${storeName}`,
  })
}

export function notifyStoreSupervisorDeliveryArrived(storeName: string, product: string) {
  return notify(['StoreSupervisor'], {
    title: 'Delivery Arrived for Offloading',
    body: `${product} arrived at ${storeName}. Tap to oversee offloading.`,
    url: '/store-supervisor',
    tag: `delivery-sup-${storeName}`,
  })
}

// ─── CashOfficer ─────────────────────────────────────────

export function notifyCashOfficerExpenseActioned(expenseId: string, status: string, title: string, amount: number) {
  return notify(['CashOfficer'], {
    title: `Expense ${status}`,
    body: `Your expense "${title}" (₦${amount.toLocaleString()}) has been ${status.toLowerCase()}. Tap to view.`,
    url: '/cash-officer',
    tag: `expense-actioned-${expenseId}`,
  })
}

export function notifyCashOfficerBalanceAlert(officeName: string) {
  return notify(['CashOfficer'], {
    title: 'Cash Balance Alert',
    body: `Cash balance alert for ${officeName}. Tap to view details.`,
    url: '/cash-officer',
    tag: `balance-alert-${officeName}`,
  })
}

// ─── CashAuthorizer ──────────────────────────────────────

export function notifyCashAuthorizerNewExpense(expenseId: string, officerName: string, title: string, amount: number) {
  return notify(['CashAuthorizer'], {
    title: 'New Expense Pending Authorisation',
    body: `₦${amount.toLocaleString()} expense "${title}" from ${officerName}. Tap to review.`,
    url: '/admin?section=cash-expenses',
    tag: `expense-pending-${expenseId}`,
  })
}

// ─── DeskOfficer ─────────────────────────────────────────

export function notifyDeskOfficerNewPayment(customerName: string, amount: number) {
  return notify(['DeskOfficer'], {
    title: 'New Customer Payment',
    body: `₦${amount.toLocaleString()} payment from ${customerName} logged. Tap to process.`,
    url: '/admin?section=customer-payments',
    tag: `payment-${customerName}`,
  })
}

export function notifyDeskOfficerCreditAlert(customerName: string) {
  return notify(['DeskOfficer'], {
    title: 'Customer Credit Alert',
    body: `Credit alert for ${customerName}. Tap to review.`,
    url: '/admin?section=credit',
    tag: `credit-alert-${customerName}`,
  })
}

export function notifyDeskOfficerStoreSaleNeedsAttention(saleId: string) {
  return notify(['DeskOfficer'], {
    title: 'Store Sale Needs Attention',
    body: `A store sale needs your review. Tap to view.`,
    url: '/admin?section=store-sales',
    tag: `sale-attention-${saleId}`,
  })
}

export function notifyDeskOfficerNewComplaint(complaintId: string) {
  return notify(['DeskOfficer'], {
    title: 'New Complaint Submitted',
    body: `A new complaint has been submitted. Tap to review.`,
    url: '/admin?section=complaints',
    tag: `complaint-${complaintId}`,
  })
}

export function notifyDeskOfficerNewDeskExpense(expenseId: string) {
  return notify(['DeskOfficer'], {
    title: 'New Desk Expense to Post',
    body: `A new desk expense needs posting. Tap to review.`,
    url: '/admin?section=desk-expenses',
    tag: `desk-expense-${expenseId}`,
  })
}

// ─── ATCOfficer ──────────────────────────────────────────

export function notifyATCNewTripStarted(tripId: string, plateNumber: string, materialCentre: string) {
  return notify(['ATCOfficer'], {
    title: 'New Trip Started',
    body: `Trip ${tripId} started — ${plateNumber}, ${materialCentre}. Tap to monitor.`,
    url: '/admin?section=monitor-trips',
    tag: `atc-trip-${tripId}`,
  })
}

export function notifyATCTripStatusChanged(tripId: string, plateNumber: string, newStatus: string) {
  return notify(['ATCOfficer'], {
    title: 'Trip Status Changed',
    body: `Trip ${tripId} (${plateNumber}) — ${newStatus}. Tap to monitor.`,
    url: '/admin?section=monitor-trips',
    tag: `atc-trip-status-${tripId}`,
  })
}

export function notifyATCPricesUpdated() {
  return notify(['ATCOfficer'], {
    title: 'Company Prices Updated',
    body: 'Company prices have been updated. Tap to view.',
    url: '/admin?section=company-prices',
    tag: 'atc-prices',
  })
}

export function notifyATCSideTripSubmitted(driverName: string, plateNumber: string) {
  return notify(['ATCOfficer'], {
    title: 'Side Trip Submitted',
    body: `Side trip by ${driverName} (${plateNumber}). Tap to review.`,
    url: '/admin?section=side-trips',
    tag: `atc-side-trip-${driverName}`,
  })
}

export function notifyATCRouteSet(tripId: string, plateNumber: string) {
  return notify(['ATCOfficer'], {
    title: 'Route Set for Trip',
    body: `Route set for trip ${tripId} (${plateNumber}). Tap to view.`,
    url: '/admin?section=monitor-trips',
    tag: `atc-route-${tripId}`,
  })
}

export function notifyATCDisputedStop(plateNumber: string, brokerName: string) {
  return notify(['ATCOfficer'], {
    title: 'Disputed Stop',
    body: `Stop disputed by ${brokerName} for ${plateNumber}. Tap to review.`,
    url: '/admin?section=complaints',
    tag: `atc-disputed-${plateNumber}`,
  })
}

// ─── Supervisor / Admin / SuperAdmin (shared) ────────────

const adminRoles = ['Supervisor', 'Admin', 'SuperAdmin']

export function notifyAdminTripStarted(tripId: string, plateNumber: string, materialCentre: string) {
  return notify(adminRoles, {
    title: 'New Trip Started',
    body: `Trip ${tripId} — ${plateNumber}, ${materialCentre}. Tap to monitor.`,
    url: '/admin?section=monitor-trips',
    tag: `admin-trip-${tripId}`,
  })
}

export function notifyAdminTripCompleted(tripId: string, plateNumber: string) {
  return notify(adminRoles, {
    title: 'Trip Completed',
    body: `Trip ${tripId} (${plateNumber}) completed. Tap to view summary.`,
    url: '/admin?section=monitor-trips',
    tag: `admin-trip-done-${tripId}`,
  })
}

export function notifyAdminPendingBrokerConfirmation(brokerName: string, hours: number) {
  return notify(adminRoles, {
    title: 'Pending Broker Confirmation',
    body: `${brokerName} has unconfirmed items for ${hours}+ hours. Tap to review.`,
    url: '/admin?section=store-sales',
    tag: `admin-pending-${brokerName}`,
  })
}

export function notifyAdminTruckRouteSet(tripId: string, plateNumber: string) {
  return notify(adminRoles, {
    title: 'Truck Route Set',
    body: `Route set for trip ${tripId} (${plateNumber}). Tap to view.`,
    url: '/admin?section=monitor-trips',
    tag: `admin-route-${tripId}`,
  })
}

export function notifyAdminStopDisputed(plateNumber: string, brokerName: string) {
  return notify(adminRoles, {
    title: 'Stop Disputed by Broker',
    body: `Stop disputed by ${brokerName} for ${plateNumber}. Tap to review.`,
    url: '/admin?section=complaints',
    tag: `admin-disputed-${plateNumber}`,
  })
}

export function notifyAdminStoreSaleDisputed(storeName: string, brokerName: string) {
  return notify(adminRoles, {
    title: 'Store Sale Disputed',
    body: `Sale at ${storeName} disputed by ${brokerName}. Tap to review.`,
    url: '/admin?section=store-sales',
    tag: `admin-sale-disputed-${storeName}`,
  })
}

export function notifyAdminLowDieselBalance(stationName: string, balance: number) {
  return notify(adminRoles, {
    title: 'Diesel Balance Below Threshold',
    body: `${stationName} — ${balance}L remaining. Tap to review.`,
    url: '/admin?section=diesel-manager',
    tag: `admin-diesel-${stationName}`,
  })
}

export function notifyAdminPendingStoreSale(brokerName: string, storeName: string, hours: number) {
  return notify(adminRoles, {
    title: 'Pending Broker Store Sale',
    body: `${brokerName} — ${storeName} pending for ${hours}+ hours. Tap to review.`,
    url: '/admin?section=store-sales',
    tag: `admin-pending-sale-${brokerName}`,
  })
}

export function notifyAdminCreditLimitExceeded(customerName: string) {
  return notify(adminRoles, {
    title: 'Credit Limit Exceeded',
    body: `Credit limit exceeded for ${customerName}. Tap to review.`,
    url: '/admin?section=credit',
    tag: `admin-credit-limit-${customerName}`,
  })
}

export function notifyAdminCreditDaysExceeded(customerName: string) {
  return notify(adminRoles, {
    title: 'Credit Days Exceeded',
    body: `Credit for ${customerName} exceeded 15 days. Tap to review.`,
    url: '/admin?section=credit',
    tag: `admin-credit-days-${customerName}`,
  })
}

export function notifyAdminPricesUpdated() {
  return notify(adminRoles, {
    title: 'Company Prices Updated',
    body: 'Company prices have been updated. Tap to view.',
    url: '/admin?section=company-prices',
    tag: 'admin-prices',
  })
}

export function notifyAdminUnresolvedComplaints(count: number) {
  return notify(adminRoles, {
    title: 'Unresolved Complaints',
    body: `${count} complaint(s) still unresolved. Tap to review.`,
    url: '/admin?section=complaints',
    tag: 'admin-complaints',
  })
}

export function notifyAdminPendingPayments(count: number) {
  return notify(adminRoles, {
    title: 'Pending Customer Payments',
    body: `${count} customer payment(s) pending to be posted. Tap to review.`,
    url: '/admin?section=customer-payments',
    tag: 'admin-payments',
  })
}

// ─── Global: Complaint Resolved ──────────────────────────

export function notifyComplaintResolved(userId: string, complaintId: string) {
  return sendToUser(userId, {
    title: 'Complaint Resolved',
    body: 'Your complaint has been resolved. Tap to view details.',
    url: '/admin?section=complaints',
    tag: `complaint-resolved-${complaintId}`,
  })
}
