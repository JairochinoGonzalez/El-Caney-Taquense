import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { ClosingReportModal } from './components/ClosingReportModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EventsCalendar } from './components/EventsCalendar';
import { FinancePayrollModule } from './components/FinancePayrollModule';
import { InventoryModule } from './components/InventoryModule';
import { LoginScreen } from './components/LoginScreen';
import { NightOpsPanel } from './components/NightOpsPanel';
import { SettingsUsersModule } from './components/SettingsUsersModule';
import { SidebarAndNav } from './components/SidebarAndNav';
import { buildInitialData } from './data/initialData';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  emailToDocId,
  handleFirestoreError,
  OperationType,
  stripUndefined,
} from './firebase';
import {
  AppSection,
  BcvRateState,
  CalendarEvent,
  ClosedShift,
  CourtesyItem,
  CourtesyRecord,
  InvoiceAttachmentDraft,
  PaymentBreakdown,
  PaymentMethod,
  PayrollRecord,
  Product,
  ProductSoldSummary,
  SaleLineItem,
  SaleRecord,
  StaffUserAccount,
  StockRestockRecord,
  TableOrder,
  UserRole,
} from './types';
import { FALLBACK_BCV_RATE, fetchOfficialBcvRate } from './utils/bcvService';
import { getTodayISO, snapshotStock } from './utils/formatters';
import {
  INLINE_DATAURL_LIMIT,
  splitDataUrlIntoChunks,
} from './utils/invoiceFileHelper';

function MainApp() {
  // --- Auth & Authorization State ---
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [authorizedAccount, setAuthorizedAccount] =
    useState<StaffUserAccount | null>(null);
  const [unauthorizedReason, setUnauthorizedReason] = useState<
    'not_registered' | 'inactive' | null
  >(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Admin station preview toggle (lets Admin test Taquilla/Caja on iPad)
  const [previewRole, setPreviewRole] = useState<UserRole>('admin');
  const [activeSection, setActiveSection] = useState<AppSection>('operacion');

  // --- Shared Firestore State ---
  const [exchangeBufferBs, setExchangeBufferBs] = useState<number>(25.0);
  const [allowEmployeeProductEdit, setAllowEmployeeProductEdit] =
    useState<boolean>(false);
  const [primaryAdminEmail, setPrimaryAdminEmail] = useState<string>(
    BOOTSTRAP_ADMIN_EMAIL
  );
  const [staffEmails, setStaffEmails] = useState<string[]>([
    BOOTSTRAP_ADMIN_EMAIL,
  ]);
  const [adminEmails, setAdminEmails] = useState<string[]>([
    BOOTSTRAP_ADMIN_EMAIL,
  ]);

  const [staffUsers, setStaffUsers] = useState<StaffUserAccount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [courtesies, setCourtesies] = useState<CourtesyRecord[]>([]);
  const [closedShifts, setClosedShifts] = useState<ClosedShift[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [restocks, setRestocks] = useState<StockRestockRecord[]>([]);

  const [bcvState, setBcvState] = useState<BcvRateState>({
    officialRate: FALLBACK_BCV_RATE,
    source: 'Cargando BCV...',
    lastUpdated: new Date().toISOString(),
    isLoading: true,
    isFallback: false,
  });

  const [recentClosedShift, setRecentClosedShift] =
    useState<ClosedShift | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const reportError = useCallback(
    (err: unknown, op: OperationType, path: string | null) => {
      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        setFatalError(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    },
    []
  );

  // --- Live BCV Rate ---
  const refreshBcv = useCallback(async () => {
    setBcvState((prev) => ({ ...prev, isLoading: true }));
    const next = await fetchOfficialBcvRate();
    setBcvState(next);
  }, []);

  useEffect(() => {
    void refreshBcv();
  }, [refreshBcv]);

  // --- Seed Initial Dataset or Auto-Migrate Ownership to Yohelly Bracho ---
  const ensureBootstrappedDatabase = useCallback(
    async (adminUser: User) => {
      const callerEmail = (adminUser.email || BOOTSTRAP_ADMIN_EMAIL)
        .trim()
        .toLowerCase();
      const ownerEmail = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
      const isBootstrapCaller = callerEmail === ownerEmail;

      const configRef = doc(db, 'appConfig', 'main');
      const configSnap = await getDoc(configRef);

      if (configSnap.exists()) {
        const cfg = configSnap.data();
        const existingStaffEmails: string[] = Array.isArray(cfg.staffEmails)
          ? cfg.staffEmails.map((e: string) => String(e).trim().toLowerCase())
          : [];
        const existingAdminEmails: string[] = Array.isArray(cfg.adminEmails)
          ? cfg.adminEmails.map((e: string) => String(e).trim().toLowerCase())
          : [];
        const existingPrimary =
          typeof cfg.primaryAdminEmail === 'string' &&
          cfg.primaryAdminEmail.includes('@')
            ? cfg.primaryAdminEmail.trim().toLowerCase()
            : null;

        const ownerDocId = emailToDocId(ownerEmail);
        const ownerStaffRef = doc(db, 'staffUsers', ownerDocId);
        const ownerStaffSnap = await getDoc(ownerStaffRef);

        const isLegacyPrimary =
          !existingPrimary || existingPrimary === 'sk8jairo3@gmail.com';
        const targetPrimary = isLegacyPrimary ? ownerEmail : existingPrimary;

        const needsOwnershipSync =
          isLegacyPrimary ||
          !existingAdminEmails.includes(ownerEmail) ||
          !existingStaffEmails.includes(ownerEmail) ||
          !ownerStaffSnap.exists();

        if (!needsOwnershipSync) return;

        const nextStaffEmails = Array.from(
          new Set([targetPrimary, ownerEmail, callerEmail, ...existingStaffEmails])
        ).slice(0, 30);
        const nextAdminEmails = Array.from(
          new Set([targetPrimary, ownerEmail, callerEmail, ...existingAdminEmails])
        ).slice(0, 10);

        await updateDoc(configRef, {
          primaryAdminEmail: targetPrimary,
          staffEmails: nextStaffEmails,
          adminEmails: nextAdminEmails,
          updatedAt: serverTimestamp(),
        });

        if (!ownerStaffSnap.exists()) {
          await setDoc(ownerStaffRef, {
            id: ownerDocId,
            name:
              isBootstrapCaller && adminUser.displayName
                ? adminUser.displayName.slice(0, 80)
                : 'Yohelly Bracho',
            email: ownerEmail,
            role: 'admin',
            active: true,
            adminEmails: nextAdminEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ownerStaffRef, {
            role: 'admin',
            active: true,
            adminEmails: nextAdminEmails,
            updatedAt: serverTimestamp(),
          });
        }

        const staffCols = [
          'products',
          'events',
          'sales',
          'tableOrders',
          'courtesies',
          'closedShifts',
        ];
        const adminCols = ['staffUsers', 'payroll', 'restocks'];
        const pendingUpdates: Array<{
          ref: ReturnType<typeof doc>;
          payload: Record<string, unknown>;
        }> = [];

        for (const col of staffCols) {
          const snap = await getDocs(
            isBootstrapCaller
              ? collection(db, col)
              : query(
                  collection(db, col),
                  where('staffEmails', 'array-contains', callerEmail)
                )
          );
          snap.docs.forEach((d) => {
            const payload: Record<string, unknown> = {
              staffEmails: nextStaffEmails,
            };
            if (
              col === 'products' ||
              col === 'events' ||
              col === 'sales' ||
              col === 'tableOrders'
            ) {
              payload.updatedAt = serverTimestamp();
            }
            pendingUpdates.push({ ref: d.ref, payload });
          });
        }

        for (const col of adminCols) {
          const snap = await getDocs(
            isBootstrapCaller
              ? collection(db, col)
              : query(
                  collection(db, col),
                  where('adminEmails', 'array-contains', callerEmail)
                )
          );
          snap.docs.forEach((d) => {
            const payload: Record<string, unknown> = {
              adminEmails: nextAdminEmails,
            };
            if (col === 'staffUsers') {
              payload.updatedAt = serverTimestamp();
            }
            if (col === 'restocks') {
              payload.staffEmails = nextStaffEmails;
            }
            pendingUpdates.push({ ref: d.ref, payload });
          });
        }

        for (let i = 0; i < pendingUpdates.length; i += 400) {
          const chunk = pendingUpdates.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((u) => batch.update(u.ref, u.payload));
          await batch.commit();
        }
        return;
      }

      if (!isBootstrapCaller) return;

      const seed = buildInitialData();
      const initialStaffEmails = [ownerEmail];
      const initialAdminEmails = [ownerEmail];
      const batch = writeBatch(db);

      batch.set(configRef, {
        exchangeBufferBs: seed.exchangeBufferBs,
        allowEmployeeProductEdit: false,
        primaryAdminEmail: ownerEmail,
        staffEmails: initialStaffEmails,
        adminEmails: initialAdminEmails,
        updatedAt: serverTimestamp(),
      });

      const bootstrapDocId = emailToDocId(ownerEmail);
      batch.set(doc(db, 'staffUsers', bootstrapDocId), {
        id: bootstrapDocId,
        name: (adminUser.displayName || 'Yohelly Bracho').slice(0, 80),
        email: ownerEmail,
        role: 'admin',
        active: true,
        adminEmails: initialAdminEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const p of seed.products) {
        batch.set(
          doc(db, 'products', p.id),
          stripUndefined({
            ...p,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }

      for (const ev of seed.events) {
        batch.set(
          doc(db, 'events', ev.id),
          stripUndefined({
            ...ev,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }

      for (const s of seed.sales) {
        batch.set(
          doc(db, 'sales', s.id),
          stripUndefined({
            ...s,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }

      for (const c of seed.courtesies) {
        batch.set(
          doc(db, 'courtesies', c.id),
          stripUndefined({
            ...c,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
          })
        );
      }

      for (const sh of seed.closedShifts) {
        batch.set(
          doc(db, 'closedShifts', sh.id),
          stripUndefined({
            ...sh,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
          })
        );
      }

      for (const pay of seed.payroll) {
        batch.set(
          doc(db, 'payroll', pay.id),
          stripUndefined({
            ...pay,
            adminEmails: initialAdminEmails,
            createdAt: serverTimestamp(),
          })
        );
      }

      for (const rst of seed.restocks) {
        batch.set(
          doc(db, 'restocks', rst.id),
          stripUndefined({
            ...rst,
            movementType: 'reposicion',
            adminEmails: initialAdminEmails,
            staffEmails: initialStaffEmails,
            createdAt: serverTimestamp(),
          })
        );
      }

      await batch.commit();
    },
    []
  );

  const authorizeSignedInUser = useCallback(
    async (user: User | null) => {
      setFirebaseUser(user);
      setAuthorizedAccount(null);
      setUnauthorizedReason(null);
      setNeedsEmailVerification(false);

      if (!user || !user.email) {
        setAuthLoading(false);
        return;
      }

      if (!user.emailVerified) {
        setNeedsEmailVerification(true);
        setAuthLoading(false);
        return;
      }

      const emailLower = user.email.trim().toLowerCase();
      setAuthLoading(true);
      try {
        if (emailLower === BOOTSTRAP_ADMIN_EMAIL) {
          try {
            await ensureBootstrappedDatabase(user);
          } catch (seedErr) {
            reportError(seedErr, OperationType.WRITE, 'appConfig/main');
            return;
          }
        }

        const staffId = emailToDocId(emailLower);
        const staffSnap = await getDoc(doc(db, 'staffUsers', staffId));

        if (staffSnap.exists()) {
          const data = staffSnap.data() as StaffUserAccount;
          if (!data.active && emailLower !== BOOTSTRAP_ADMIN_EMAIL) {
            setUnauthorizedReason('inactive');
          } else {
            const role: UserRole =
              emailLower === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : data.role;
            if (role === 'admin' && emailLower !== BOOTSTRAP_ADMIN_EMAIL) {
              try {
                await ensureBootstrappedDatabase(user);
              } catch {
                // Non-blocking ownership sync when a secondary admin signs in
              }
            }
            setAuthorizedAccount({
              id: data.id,
              name: data.name,
              email: emailLower,
              role,
              active: true,
              quickPin: data.quickPin,
            });
            setPreviewRole(role);
            setActiveSection('operacion');
          }
        } else if (emailLower === BOOTSTRAP_ADMIN_EMAIL) {
          setAuthorizedAccount({
            id: staffId,
            name: user.displayName || 'Yohelly Bracho',
            email: emailLower,
            role: 'admin',
            active: true,
          });
          setPreviewRole('admin');
          setActiveSection('operacion');
        } else {
          setUnauthorizedReason('not_registered');
        }
      } catch (err) {
        reportError(err, OperationType.GET, `staffUsers/${emailToDocId(emailLower)}`);
      } finally {
        setAuthLoading(false);
      }
    },
    [ensureBootstrappedDatabase, reportError]
  );

  // --- Firebase Auth Listener ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      void authorizeSignedInUser(user);
    });

    return () => unsub();
  }, [authorizeSignedInUser]);

  const handleRefreshVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    await current.reload();
    if (!current.emailVerified) {
      throw new Error('Correo aún no verificado.');
    }
    await current.getIdToken(true);
    await authorizeSignedInUser(current);
  }, [authorizeSignedInUser]);

  // --- Real-Time Firestore Listeners ---
  const actualRole: UserRole = authorizedAccount?.role || 'caja';
  const effectiveRole: UserRole =
    actualRole === 'admin' ? previewRole : actualRole;
  const userEmail = authorizedAccount?.email || '';

  useEffect(() => {
    if (!authorizedAccount || !userEmail) return;
    setDataLoading(true);

    const unsubs: Array<() => void> = [];
    let pendingInitial = 7;
    const markReady = () => {
      pendingInitial = Math.max(0, pendingInitial - 1);
      if (pendingInitial === 0) setDataLoading(false);
    };

    // 1. appConfig/main
    unsubs.push(
      onSnapshot(
        doc(db, 'appConfig', 'main'),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            if (typeof d.exchangeBufferBs === 'number') {
              setExchangeBufferBs(d.exchangeBufferBs);
            }
            setAllowEmployeeProductEdit(Boolean(d.allowEmployeeProductEdit));
            if (
              typeof d.primaryAdminEmail === 'string' &&
              d.primaryAdminEmail.includes('@')
            ) {
              setPrimaryAdminEmail(d.primaryAdminEmail.trim().toLowerCase());
            } else {
              setPrimaryAdminEmail(BOOTSTRAP_ADMIN_EMAIL);
            }
            if (Array.isArray(d.staffEmails) && d.staffEmails.length > 0) {
              setStaffEmails(d.staffEmails);
            }
            if (Array.isArray(d.adminEmails) && d.adminEmails.length > 0) {
              setAdminEmails(d.adminEmails);
            }
          }
          markReady();
        },
        (err) => reportError(err, OperationType.GET, 'appConfig/main')
      )
    );

    // 2. products
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'products'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          setProducts(snap.docs.map((d) => d.data() as Product));
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'products')
      )
    );

    // 3. events
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'events'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          setEvents(snap.docs.map((d) => d.data() as CalendarEvent));
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'events')
      )
    );

    // 4. sales
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'sales'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as SaleRecord);
          list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          setSales(list);
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'sales')
      )
    );

    // 5. courtesies
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'courtesies'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as CourtesyRecord);
          list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          setCourtesies(list);
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'courtesies')
      )
    );

    // 6. closedShifts
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'closedShifts'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as ClosedShift);
          list.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
          setClosedShifts(list);
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'closedShifts')
      )
    );

    // 7. tableOrders
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'tableOrders'),
          where('staffEmails', 'array-contains', userEmail)
        ),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as TableOrder);
          list.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
          setTableOrders(list);
          markReady();
        },
        (err) => reportError(err, OperationType.LIST, 'tableOrders')
      )
    );

    // 7. Admin-only collections
    if (actualRole === 'admin') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'staffUsers'),
            where('adminEmails', 'array-contains', userEmail)
          ),
          (snap) => {
            setStaffUsers(snap.docs.map((d) => d.data() as StaffUserAccount));
          },
          (err) => reportError(err, OperationType.LIST, 'staffUsers')
        )
      );

      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'payroll'),
            where('adminEmails', 'array-contains', userEmail)
          ),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as PayrollRecord);
            list.sort((a, b) => b.date.localeCompare(a.date));
            setPayroll(list);
          },
          (err) => reportError(err, OperationType.LIST, 'payroll')
        )
      );

      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'restocks'),
            where('adminEmails', 'array-contains', userEmail)
          ),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as StockRestockRecord);
            list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            setRestocks(list);
          },
          (err) => reportError(err, OperationType.LIST, 'restocks')
        )
      );
    } else if (actualRole === 'caja' || actualRole === 'taquilla') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'restocks'),
            where('staffEmails', 'array-contains', userEmail)
          ),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as StockRestockRecord);
            list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            setRestocks(list);
          },
          (err) => reportError(err, OperationType.LIST, 'restocks')
        )
      );
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [authorizedAccount, actualRole, userEmail, reportError]);

  // --- Navigation & Role Preview Guards ---
  const handlePreviewRoleChange = (nextRole: UserRole) => {
    if (actualRole !== 'admin') return;
    setPreviewRole(nextRole);
    if (nextRole === 'mesero' && activeSection !== 'operacion') {
      setActiveSection('operacion');
      return;
    }
    if (
      nextRole !== 'admin' &&
      (activeSection === 'finanzas' || activeSection === 'configuracion')
    ) {
      setActiveSection('operacion');
    }
  };

  const handleSelectSection = (section: AppSection) => {
    if (effectiveRole === 'mesero' && section !== 'operacion') {
      setActiveSection('operacion');
      return;
    }
    if (
      effectiveRole !== 'admin' &&
      (section === 'finanzas' || section === 'configuracion')
    ) {
      setActiveSection('operacion');
      return;
    }
    setActiveSection(section);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const activeParty = useMemo(
    () => events.find((e) => e.status === 'en_curso') || null,
    [events]
  );

  const effectiveRate = Number(
    (bcvState.officialRate + exchangeBufferBs).toFixed(2)
  );

  // --- Admin Config & Staff Sync ---
  const syncEmailListsAcrossFirestore = async (
    nextStaffList: StaffUserAccount[],
    overridePrimaryAdminEmail?: string
  ) => {
    const effectivePrimary = (
      overridePrimaryAdminEmail ||
      primaryAdminEmail ||
      BOOTSTRAP_ADMIN_EMAIL
    )
      .trim()
      .toLowerCase();

    const nextStaffEmails = Array.from(
      new Set([
        effectivePrimary,
        ...nextStaffList
          .filter((u) => u.active)
          .map((u) => u.email.trim().toLowerCase()),
      ])
    ).slice(0, 30);

    const nextAdminEmails = Array.from(
      new Set([
        effectivePrimary,
        ...nextStaffList
          .filter((u) => u.active && u.role === 'admin')
          .map((u) => u.email.trim().toLowerCase()),
      ])
    ).slice(0, 10);

    await updateDoc(doc(db, 'appConfig', 'main'), {
      primaryAdminEmail: effectivePrimary,
      staffEmails: nextStaffEmails,
      adminEmails: nextAdminEmails,
      updatedAt: serverTimestamp(),
    });

    const staffCollections = [
      'products',
      'events',
      'sales',
      'tableOrders',
      'courtesies',
      'closedShifts',
    ];
    const adminCollections = ['staffUsers', 'payroll', 'restocks'];

    const pendingUpdates: Array<{
      ref: ReturnType<typeof doc>;
      payload: Record<string, unknown>;
    }> = [];

    for (const col of staffCollections) {
      const snap = await getDocs(
        query(
          collection(db, col),
          where('staffEmails', 'array-contains', userEmail)
        )
      );
      snap.docs.forEach((d) => {
        const updatePayload: Record<string, unknown> = {
          staffEmails: nextStaffEmails,
        };
        if (
          col === 'products' ||
          col === 'events' ||
          col === 'sales' ||
          col === 'tableOrders'
        ) {
          updatePayload.updatedAt = serverTimestamp();
        }
        pendingUpdates.push({ ref: d.ref, payload: updatePayload });
      });
    }

    for (const col of adminCollections) {
      const snap = await getDocs(
        query(
          collection(db, col),
          where('adminEmails', 'array-contains', userEmail)
        )
      );
      for (const d of snap.docs) {
        const updatePayload: Record<string, unknown> = {
          adminEmails: nextAdminEmails,
        };
        if (col === 'staffUsers') {
          updatePayload.updatedAt = serverTimestamp();
        }
        if (col === 'restocks') {
          updatePayload.staffEmails = nextStaffEmails;
          const chunkCount = Number(d.data()?.invoiceAttachmentChunkCount || 0);
          if (chunkCount > 0) {
            const chunksSnap = await getDocs(
              query(
                collection(db, 'restocks', d.id, 'attachmentChunks'),
                where('adminEmails', 'array-contains', userEmail)
              )
            );
            chunksSnap.docs.forEach((cd) => {
              pendingUpdates.push({
                ref: cd.ref,
                payload: {
                  adminEmails: nextAdminEmails,
                  staffEmails: nextStaffEmails,
                },
              });
            });
          }
        }
        pendingUpdates.push({ ref: d.ref, payload: updatePayload });
      }
    }

    for (let i = 0; i < pendingUpdates.length; i += 400) {
      const chunk = pendingUpdates.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((item) => batch.update(item.ref, item.payload));
      await batch.commit();
    }
  };

  const handleSaveStaffUser = async (params: {
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
  }) => {
    if (actualRole !== 'admin') return;
    const cleanEmail = params.email.trim().toLowerCase();
    const isPrimary = cleanEmail === primaryAdminEmail.toLowerCase();
    const docId = emailToDocId(cleanEmail);
    const ref = doc(db, 'staffUsers', docId);
    const existing = staffUsers.find((u) => u.id === docId);

    try {
      if (existing) {
        await updateDoc(ref, {
          name: params.name.trim(),
          email: cleanEmail,
          role: isPrimary ? 'admin' : params.role,
          active: isPrimary ? true : params.active,
          adminEmails,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          id: docId,
          name: params.name.trim(),
          email: cleanEmail,
          role: isPrimary ? 'admin' : params.role,
          active: isPrimary ? true : params.active,
          adminEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const nextList: StaffUserAccount[] = existing
        ? staffUsers.map((u) =>
            u.id === docId
              ? {
                  ...u,
                  id: docId,
                  name: params.name.trim(),
                  email: cleanEmail,
                  role: isPrimary ? 'admin' : params.role,
                  active: isPrimary ? true : params.active,
                }
              : u
          )
        : [
            ...staffUsers,
            {
              id: docId,
              name: params.name.trim(),
              email: cleanEmail,
              role: isPrimary ? 'admin' : params.role,
              active: isPrimary ? true : params.active,
            },
          ];

      await syncEmailListsAcrossFirestore(nextList);
    } catch (err) {
      reportError(err, OperationType.WRITE, `staffUsers/${docId}`);
      throw err;
    }
  };

  const handleDeleteStaffUser = async (userId: string) => {
    if (actualRole !== 'admin') return;
    const target = staffUsers.find((u) => u.id === userId);
    if (!target || target.email.toLowerCase() === primaryAdminEmail.toLowerCase()) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'staffUsers', userId));
      const nextList = staffUsers.filter((u) => u.id !== userId);
      await syncEmailListsAcrossFirestore(nextList);
    } catch (err) {
      reportError(err, OperationType.DELETE, `staffUsers/${userId}`);
    }
  };

  const handleTransferPrimaryAdmin = async (params: {
    newEmail: string;
    newName: string;
    keepPreviousAsAdmin: boolean;
  }) => {
    if (actualRole !== 'admin') return;
    const cleanNewEmail = params.newEmail.trim().toLowerCase();
    const cleanNewName = params.newName.trim().slice(0, 80);
    if (!cleanNewEmail || !cleanNewEmail.includes('@') || !cleanNewName) return;

    const newDocId = emailToDocId(cleanNewEmail);
    const existingNew = staffUsers.find((u) => u.id === newDocId);
    const prevPrimaryEmail = primaryAdminEmail.toLowerCase();
    const prevDocId = emailToDocId(prevPrimaryEmail);

    const nextAdminEmailsPreview = Array.from(
      new Set([
        cleanNewEmail,
        ...adminEmails,
      ])
    ).slice(0, 10);

    try {
      if (existingNew) {
        await updateDoc(doc(db, 'staffUsers', newDocId), {
          name: cleanNewName,
          email: cleanNewEmail,
          role: 'admin',
          active: true,
          adminEmails: nextAdminEmailsPreview,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'staffUsers', newDocId), {
          id: newDocId,
          name: cleanNewName,
          email: cleanNewEmail,
          role: 'admin',
          active: true,
          adminEmails: nextAdminEmailsPreview,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      let nextList: StaffUserAccount[] = existingNew
        ? staffUsers.map((u) =>
            u.id === newDocId
              ? {
                  ...u,
                  name: cleanNewName,
                  email: cleanNewEmail,
                  role: 'admin',
                  active: true,
                }
              : u
          )
        : [
            ...staffUsers,
            {
              id: newDocId,
              name: cleanNewName,
              email: cleanNewEmail,
              role: 'admin',
              active: true,
            },
          ];

      if (
        !params.keepPreviousAsAdmin &&
        prevPrimaryEmail !== cleanNewEmail &&
        prevPrimaryEmail !== userEmail.toLowerCase()
      ) {
        const prevDocExists = staffUsers.some((u) => u.id === prevDocId);
        if (prevDocExists) {
          await deleteDoc(doc(db, 'staffUsers', prevDocId));
          nextList = nextList.filter((u) => u.id !== prevDocId);
        }
      }

      await syncEmailListsAcrossFirestore(nextList, cleanNewEmail);
      setPrimaryAdminEmail(cleanNewEmail);
    } catch (err) {
      reportError(err, OperationType.WRITE, 'appConfig/main');
      throw err;
    }
  };

  const handleMarkUserPasswordUpdated = async (userId: string) => {
    if (actualRole !== 'admin') return;
    const exists = staffUsers.some((u) => u.id === userId);
    if (!exists) return;
    try {
      await updateDoc(doc(db, 'staffUsers', userId), {
        passwordUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-critical timestamp metadata update
    }
  };

  const handleSaveUserQuickPin = async (
    userId: string,
    quickPin: string | null
  ) => {
    if (actualRole !== 'admin') return;
    const exists = staffUsers.some((u) => u.id === userId);
    if (!exists) return;

    const cleanPin = quickPin ? quickPin.replace(/\D/g, '').slice(0, 4) : '';
    if (cleanPin && cleanPin.length !== 4) {
      throw new Error('El PIN debe tener exactamente 4 dígitos numéricos.');
    }

    try {
      await updateDoc(doc(db, 'staffUsers', userId), {
        quickPin: cleanPin ? cleanPin : deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, `staffUsers/${userId}`);
      throw err;
    }
  };

  const handleToggleAllowEmployeeEdit = async (allowed: boolean) => {
    if (actualRole !== 'admin') return;
    try {
      await updateDoc(doc(db, 'appConfig', 'main'), {
        allowEmployeeProductEdit: allowed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, 'appConfig/main');
    }
  };

  const handleChangeExchangeBuffer = async (newBuffer: number) => {
    if (actualRole !== 'admin') return;
    try {
      await updateDoc(doc(db, 'appConfig', 'main'), {
        exchangeBufferBs: newBuffer,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, 'appConfig/main');
    }
  };

  // --- Inventory Handlers ---
  const attachInvoiceToBatch = (
    restockId: string,
    attachment: InvoiceAttachmentDraft | null | undefined,
    batch: ReturnType<typeof writeBatch>
  ): Record<string, unknown> => {
    if (!attachment) return {};

    const cleanName = attachment.name.trim().slice(0, 180) || 'factura';
    const clampedSize = Math.max(
      1,
      Math.min(2097152, Math.round(attachment.sizeBytes || 1))
    );

    if (attachment.dataUrl.length <= INLINE_DATAURL_LIMIT) {
      return {
        invoiceAttachmentName: cleanName,
        invoiceAttachmentType: attachment.type,
        invoiceAttachmentMime: attachment.mime,
        invoiceAttachmentSizeBytes: clampedSize,
        invoiceAttachmentDataUrl: attachment.dataUrl,
        invoiceAttachmentChunkCount: 0,
      };
    }

    const chunks = splitDataUrlIntoChunks(attachment.dataUrl);
    chunks.forEach((chunkData, idx) => {
      const chunkId = `chunk_${idx}`;
      batch.set(doc(db, 'restocks', restockId, 'attachmentChunks', chunkId), {
        id: chunkId,
        restockId,
        chunkIndex: idx,
        data: chunkData,
        adminEmails,
        staffEmails,
        createdAt: serverTimestamp(),
      });
    });

    return {
      invoiceAttachmentName: cleanName,
      invoiceAttachmentType: attachment.type,
      invoiceAttachmentMime: attachment.mime,
      invoiceAttachmentSizeBytes: clampedSize,
      invoiceAttachmentChunkCount: chunks.length,
    };
  };

  const handleAddProduct = async (
    prodData: Omit<Product, 'id'>,
    initialEntry?: {
      casesAdded: number;
      unitsAdded: number;
      totalCostUsd: number;
      totalCostBs?: number;
      invoiceNumber?: string;
      invoiceAttachment?: InvoiceAttachmentDraft | null;
      date?: string;
    }
  ) => {
    const now = Date.now();
    const id = `prod-${now}`;
    const restockId = `rst-${now}`;
    const cleanInvoiceNumber = initialEntry?.invoiceNumber?.trim().slice(0, 120);

    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'products', id),
        stripUndefined({
          ...prodData,
          id,
          staffEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      const attachmentFields = attachInvoiceToBatch(
        restockId,
        initialEntry?.invoiceAttachment,
        batch
      );

      const restockPayload = stripUndefined({
        id: restockId,
        timestamp: new Date(now).toISOString(),
        date: initialEntry?.date || getTodayISO(),
        productId: id,
        productName: prodData.name.slice(0, 120),
        movementType: 'nuevo_producto',
        casesAdded: Math.max(0, initialEntry?.casesAdded ?? 0),
        unitsAdded: Math.max(0, initialEntry?.unitsAdded ?? prodData.stockUnits),
        totalUnitsAdded: Math.max(0, prodData.stockUnits),
        totalCostUsd: Math.max(
          0,
          Number(
            (
              initialEntry?.totalCostUsd ??
              prodData.stockUnits * prodData.costUnitUsd
            ).toFixed(2)
          )
        ),
        totalCostBs:
          initialEntry?.totalCostBs && initialEntry.totalCostBs > 0
            ? Number(initialEntry.totalCostBs.toFixed(2))
            : undefined,
        invoiceNumber: cleanInvoiceNumber || undefined,
        recordedByEmail: authorizedAccount?.email?.slice(0, 120),
        recordedByName: authorizedAccount?.name?.slice(0, 80),
        ...attachmentFields,
        adminEmails,
        staffEmails,
        createdAt: serverTimestamp(),
      });

      batch.set(doc(db, 'restocks', restockId), restockPayload);
      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.CREATE, `products/${id}`);
    }
  };

  const handleUpdateProduct = async (
    productId: string,
    updates: Partial<Omit<Product, 'id'>>
  ) => {
    if (actualRole !== 'admin' && !allowEmployeeProductEdit) return;
    try {
      await updateDoc(
        doc(db, 'products', productId),
        stripUndefined({
          ...updates,
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      reportError(err, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const handleRestockProduct = async (params: {
    productId: string;
    casesAdded: number;
    unitsAdded: number;
    totalCostUsd: number;
    totalCostBs?: number;
    newPriceUnitUsd?: number;
    newPriceCaseUsd?: number;
    newCostUnitUsd?: number;
    newCostCaseUsd?: number;
    note?: string;
    invoiceNumber?: string;
    invoiceAttachment?: InvoiceAttachmentDraft | null;
    date: string;
  }) => {
    const target = products.find((p) => p.id === params.productId);
    if (!target) return;
    const totalUnitsAdded =
      params.casesAdded * target.caseSize + params.unitsAdded;
    const canEditPrices = actualRole === 'admin' || allowEmployeeProductEdit;

    const prodUpdates: Record<string, unknown> = {
      stockUnits: target.stockUnits + totalUnitsAdded,
      updatedAt: serverTimestamp(),
    };
    if (params.newCostUnitUsd !== undefined) {
      prodUpdates.costUnitUsd = params.newCostUnitUsd;
    }
    if (params.newCostCaseUsd !== undefined) {
      prodUpdates.costCaseUsd = params.newCostCaseUsd;
    }
    if (canEditPrices && params.newPriceUnitUsd !== undefined) {
      prodUpdates.priceUnitUsd = params.newPriceUnitUsd;
    }
    if (canEditPrices && params.newPriceCaseUsd !== undefined) {
      prodUpdates.priceCaseUsd = params.newPriceCaseUsd;
    }

    const restockId = `rst-${Date.now()}`;

    try {
      const batch = writeBatch(db);
      const attachmentFields = attachInvoiceToBatch(
        restockId,
        params.invoiceAttachment,
        batch
      );

      const restockPayload = stripUndefined({
        id: restockId,
        timestamp: new Date().toISOString(),
        date: params.date,
        productId: target.id,
        productName: target.name.slice(0, 120),
        movementType: 'reposicion',
        casesAdded: params.casesAdded,
        unitsAdded: params.unitsAdded,
        totalUnitsAdded,
        totalCostUsd: Number(params.totalCostUsd.toFixed(2)),
        totalCostBs:
          params.totalCostBs && params.totalCostBs > 0
            ? Number(params.totalCostBs.toFixed(2))
            : undefined,
        note: params.note?.trim().slice(0, 200) || undefined,
        invoiceNumber: params.invoiceNumber?.trim().slice(0, 120) || undefined,
        recordedByEmail: authorizedAccount?.email?.slice(0, 120),
        recordedByName: authorizedAccount?.name?.slice(0, 80),
        ...attachmentFields,
        adminEmails,
        staffEmails,
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, 'products', target.id), prodUpdates);
      batch.set(doc(db, 'restocks', restockId), restockPayload);
      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.WRITE, `products/${target.id}`);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (actualRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (err) {
      reportError(err, OperationType.DELETE, `products/${productId}`);
    }
  };

  // --- Events & Party Lifecycle ---
  const handleCreateEvent = async (
    eventData: Omit<CalendarEvent, 'id' | 'status'>
  ) => {
    const id = `evt-${Date.now()}`;
    try {
      await setDoc(
        doc(db, 'events', id),
        stripUndefined({
          ...eventData,
          id,
          status: 'programado',
          staffEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      reportError(err, OperationType.CREATE, `events/${id}`);
    }
  };

  const handleUpdateEvent = async (
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'status'>>
  ) => {
    try {
      await updateDoc(
        doc(db, 'events', eventId),
        stripUndefined({
          ...updates,
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      reportError(err, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  const handleAddRentalPayment = async (
    eventId: string,
    amountUsd: number
  ) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const nextPaid = Math.min(ev.totalRentalUsd, ev.depositPaidUsd + amountUsd);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        depositPaidUsd: nextPaid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  const handleStartParty = async (eventId: string) => {
    if (activeParty) return;
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'events', eventId), {
        status: 'en_curso',
        openedAt: nowIso,
        updatedAt: serverTimestamp(),
      });
      setActiveSection('operacion');
    } catch (err) {
      reportError(err, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  // --- POS & Audit Handlers ---
  const handleRecordSale = async (params: {
    kind: 'barra' | 'taquilla';
    items: SaleLineItem[];
    paymentMethod: PaymentMethod;
    paymentBreakdown: PaymentBreakdown;
    amountReceivedUsd?: number;
    amountReceivedBs?: number;
    changeGivenUsd?: number;
    changeGivenBs?: number;
    changeNote?: string;
  }) => {
    if (!activeParty) return;

    const totalUsd = params.items.reduce((sum, i) => sum + i.subtotalUsd, 0);
    const totalBs = totalUsd * effectiveRate;
    const saleId = `sale-${Date.now()}`;

    const salePayload = stripUndefined({
      id: saleId,
      eventId: activeParty.id,
      timestamp: new Date().toISOString(),
      kind: params.kind,
      items: params.items,
      totalUsd,
      totalBs,
      bcvRateAtSale: bcvState.officialRate,
      effectiveRateAtSale: effectiveRate,
      bufferBsAtSale: exchangeBufferBs,
      paymentMethod: params.paymentMethod,
      paymentBreakdown: stripUndefined({ ...params.paymentBreakdown }),
      amountReceivedUsd: params.amountReceivedUsd,
      amountReceivedBs: params.amountReceivedBs,
      changeGivenUsd: params.changeGivenUsd,
      changeGivenBs: params.changeGivenBs,
      changeNote: params.changeNote,
      status: 'active',
      staffEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'sales', saleId), salePayload);

      if (params.kind === 'barra') {
        for (const p of products) {
          const deducted = params.items
            .filter((i) => i.productId === p.id)
            .reduce((sum, i) => sum + i.unitsDeducted, 0);
          if (deducted > 0) {
            batch.update(doc(db, 'products', p.id), {
              stockUnits: Math.max(0, p.stockUnits - deducted),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.WRITE, `sales/${saleId}`);
    }
  };

  // --- Table Orders (Mesero -> Cajero Workflow) ---
  const handleSaveTableOrder = async (params: {
    existingOrderId?: string;
    tableName: string;
    items: SaleLineItem[];
    notes?: string;
    status?: 'open' | 'ready_to_close';
  }) => {
    if (!activeParty || !authorizedAccount || params.items.length === 0) return;

    const subtotalUsd = Number(
      params.items.reduce((sum, i) => sum + i.subtotalUsd, 0).toFixed(2)
    );
    const subtotalBs = Number((subtotalUsd * effectiveRate).toFixed(2));

    if (params.existingOrderId) {
      const existing = tableOrders.find((t) => t.id === params.existingOrderId);
      if (!existing || (existing.status !== 'open' && existing.status !== 'ready_to_close')) {
        return;
      }
      try {
        await updateDoc(
          doc(db, 'tableOrders', existing.id),
          stripUndefined({
            tableName: params.tableName.trim().slice(0, 60),
            items: params.items,
            subtotalUsd,
            subtotalBs,
            status: params.status || existing.status,
            notes: params.notes?.trim() || undefined,
            updatedAt: serverTimestamp(),
          })
        );
      } catch (err) {
        reportError(err, OperationType.UPDATE, `tableOrders/${existing.id}`);
      }
      return;
    }

    const orderId = `mesa-${Date.now()}`;
    try {
      await setDoc(
        doc(db, 'tableOrders', orderId),
        stripUndefined({
          id: orderId,
          eventId: activeParty.id,
          tableName: params.tableName.trim().slice(0, 60),
          waiterEmail: authorizedAccount.email,
          waiterName: authorizedAccount.name.slice(0, 80),
          items: params.items,
          subtotalUsd,
          subtotalBs,
          status: 'open',
          openedAt: new Date().toISOString(),
          notes: params.notes?.trim() || undefined,
          staffEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      reportError(err, OperationType.CREATE, `tableOrders/${orderId}`);
    }
  };

  const handleRequestTableClose = async (orderId: string) => {
    const existing = tableOrders.find((t) => t.id === orderId);
    if (!existing || existing.status !== 'open') return;
    try {
      await updateDoc(doc(db, 'tableOrders', orderId), {
        status: 'ready_to_close',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, `tableOrders/${orderId}`);
    }
  };

  const handleCloseTableOrder = async (params: {
    orderId: string;
    paymentMethod: PaymentMethod;
    paymentBreakdown: PaymentBreakdown;
    amountReceivedUsd?: number;
    amountReceivedBs?: number;
    changeGivenUsd?: number;
    changeGivenBs?: number;
    changeNote?: string;
  }) => {
    if (!activeParty || !authorizedAccount) return;
    if (actualRole !== 'admin' && actualRole !== 'caja') return;
    const target = tableOrders.find((t) => t.id === params.orderId);
    if (!target || (target.status !== 'open' && target.status !== 'ready_to_close')) {
      return;
    }

    const totalUsd = target.items.reduce((sum, i) => sum + i.subtotalUsd, 0);
    const totalBs = totalUsd * effectiveRate;
    const saleId = `sale-${Date.now()}`;
    const closedAt = new Date().toISOString();

    const mesaLabel = `Mesa: ${target.tableName} (${target.waiterName})`;
    const combinedNote = [mesaLabel, params.changeNote?.trim()]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200);

    const salePayload = stripUndefined({
      id: saleId,
      eventId: activeParty.id,
      timestamp: closedAt,
      kind: 'barra',
      items: target.items,
      totalUsd,
      totalBs,
      bcvRateAtSale: bcvState.officialRate,
      effectiveRateAtSale: effectiveRate,
      bufferBsAtSale: exchangeBufferBs,
      paymentMethod: params.paymentMethod,
      paymentBreakdown: stripUndefined({ ...params.paymentBreakdown }),
      amountReceivedUsd: params.amountReceivedUsd,
      amountReceivedBs: params.amountReceivedBs,
      changeGivenUsd: params.changeGivenUsd,
      changeGivenBs: params.changeGivenBs,
      changeNote: combinedNote || undefined,
      cashierNote: mesaLabel.slice(0, 200),
      status: 'active',
      staffEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'sales', saleId), salePayload);
      batch.update(doc(db, 'tableOrders', target.id), {
        status: 'closed',
        saleId,
        paymentMethod: params.paymentMethod,
        closedByEmail: authorizedAccount.email,
        closedAt,
        updatedAt: serverTimestamp(),
      });

      for (const p of products) {
        const deducted = target.items
          .filter((i) => i.productId === p.id)
          .reduce((sum, i) => sum + i.unitsDeducted, 0);
        if (deducted > 0) {
          batch.update(doc(db, 'products', p.id), {
            stockUnits: Math.max(0, p.stockUnits - deducted),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.WRITE, `tableOrders/${target.id}`);
    }
  };

  const handleCancelTableOrder = async (orderId: string) => {
    if (!authorizedAccount) return;
    if (actualRole !== 'admin' && actualRole !== 'caja') return;
    const target = tableOrders.find((t) => t.id === orderId);
    if (!target || (target.status !== 'open' && target.status !== 'ready_to_close')) {
      return;
    }
    try {
      await updateDoc(doc(db, 'tableOrders', orderId), {
        status: 'cancelled',
        closedByEmail: authorizedAccount.email,
        closedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      reportError(err, OperationType.UPDATE, `tableOrders/${orderId}`);
    }
  };

  const handleRecordCourtesy = async (params: {
    recipient: string;
    reason: string;
    items: CourtesyItem[];
  }) => {
    if (!activeParty) return;
    const totalCostUsd = params.items.reduce((sum, i) => sum + i.costUsd, 0);
    const cortId = `cort-${Date.now()}`;

    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'courtesies', cortId),
        stripUndefined({
          id: cortId,
          eventId: activeParty.id,
          timestamp: new Date().toISOString(),
          recipient: params.recipient,
          reason: params.reason,
          items: params.items,
          totalCostUsd,
          staffEmails,
          createdAt: serverTimestamp(),
        })
      );

      for (const p of products) {
        const deducted = params.items
          .filter((i) => i.productId === p.id)
          .reduce((sum, i) => sum + i.unitsDeducted, 0);
        if (deducted > 0) {
          batch.update(doc(db, 'products', p.id), {
            stockUnits: Math.max(0, p.stockUnits - deducted),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.WRITE, `courtesies/${cortId}`);
    }
  };

  const handleSuspendSale = async (saleId: string, reason: string) => {
    const target = sales.find((s) => s.id === saleId);
    if (!target || target.status === 'suspended') return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'sales', saleId), {
        status: 'suspended',
        suspendReason: reason,
        suspendedAt: new Date().toISOString(),
        suspendedByRole: effectiveRole,
        updatedAt: serverTimestamp(),
      });

      if (target.kind === 'barra') {
        for (const p of products) {
          const restored = target.items
            .filter((i) => i.productId === p.id)
            .reduce((sum, i) => sum + i.unitsDeducted, 0);
          if (restored > 0) {
            batch.update(doc(db, 'products', p.id), {
              stockUnits: p.stockUnits + restored,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.UPDATE, `sales/${saleId}`);
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    if (actualRole !== 'admin') return;
    const target = sales.find((s) => s.id === saleId);
    if (!target) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'sales', saleId));

      if (target.kind === 'barra' && target.status === 'active') {
        for (const p of products) {
          const restored = target.items
            .filter((i) => i.productId === p.id)
            .reduce((sum, i) => sum + i.unitsDeducted, 0);
          if (restored > 0) {
            batch.update(doc(db, 'products', p.id), {
              stockUnits: p.stockUnits + restored,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      await batch.commit();
    } catch (err) {
      reportError(err, OperationType.DELETE, `sales/${saleId}`);
    }
  };

  const handleCloseParty = async () => {
    if (!activeParty) return;
    const closedAt = new Date().toISOString();

    const partySalesAll = sales.filter((s) => s.eventId === activeParty.id);
    const activeSales = partySalesAll.filter((s) => s.status === 'active');
    const suspendedSales = partySalesAll.filter(
      (s) => s.status === 'suspended'
    );
    const partyCourtesies = courtesies.filter(
      (c) => c.eventId === activeParty.id
    );

    const totalAttendees =
      activeParty.type === 'fiesta'
        ? activeSales
            .filter((s) => s.kind === 'taquilla')
            .reduce(
              (sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0),
              0
            )
        : 0;

    const taquillaUsd =
      activeParty.type === 'fiesta'
        ? activeSales
            .filter((s) => s.kind === 'taquilla')
            .reduce((sum, s) => sum + s.totalUsd, 0)
        : 0;

    const barraUsd = activeSales
      .filter((s) => s.kind === 'barra')
      .reduce((sum, s) => sum + s.totalUsd, 0);

    const totalRevenueUsd = taquillaUsd + barraUsd;
    const totalRevenueBs = activeSales.reduce((sum, s) => sum + s.totalBs, 0);

    const cashUsdTotal = activeSales.reduce(
      (sum, s) => sum + s.paymentBreakdown.efectivoUsd,
      0
    );
    const zelleUsdTotal = activeSales.reduce(
      (sum, s) => sum + s.paymentBreakdown.zelleUsd,
      0
    );
    const pagoMovilBsTotal = activeSales.reduce(
      (sum, s) =>
        sum +
        (s.paymentBreakdown.pagoMovilBs !== undefined
          ? s.paymentBreakdown.pagoMovilBs
          : s.paymentMethod === 'tarjeta'
            ? 0
            : s.paymentBreakdown.bsAmount),
      0
    );
    const tarjetaBsTotal = activeSales.reduce(
      (sum, s) =>
        sum +
        (s.paymentBreakdown.tarjetaBs !== undefined
          ? s.paymentBreakdown.tarjetaBs
          : s.paymentMethod === 'tarjeta'
            ? s.paymentBreakdown.bsAmount
            : 0),
      0
    );

    let baseBcvRevenueUsd = 0;
    let exchangeSurplusUsd = 0;
    let exchangeSurplusBs = 0;
    let cogsUsd = 0;

    for (const s of activeSales) {
      const usdDirect =
        s.paymentBreakdown.efectivoUsd + s.paymentBreakdown.zelleUsd;
      const bsPaid = s.paymentBreakdown.bsAmount;
      const usdEquivInBs =
        s.effectiveRateAtSale > 0 ? bsPaid / s.effectiveRateAtSale : 0;
      const extraBs = usdEquivInBs * s.bufferBsAtSale;
      const extraUsd =
        s.bcvRateAtSale > 0 ? extraBs / s.bcvRateAtSale : 0;

      baseBcvRevenueUsd += usdDirect + usdEquivInBs;
      exchangeSurplusBs += extraBs;
      exchangeSurplusUsd += extraUsd;

      cogsUsd += s.items.reduce(
        (acc, item) => acc + item.unitCostUsd * item.quantity,
        0
      );
    }

    const productMap = new Map<string, ProductSoldSummary>();
    for (const s of activeSales.filter((sale) => sale.kind === 'barra')) {
      for (const item of s.items) {
        const prod = products.find((p) => p.id === item.productId);
        const cleanName = prod ? prod.name : item.name;
        const caseSize = prod?.caseSize || 36;
        const existing = productMap.get(cleanName) || {
          name: cleanName,
          caseSize,
          casesSold: 0,
          looseUnitsSold: 0,
          totalUnitsSold: 0,
          revenueUsd: 0,
        };

        if (item.mode === 'case') {
          existing.casesSold += item.quantity;
        } else {
          existing.looseUnitsSold += item.quantity;
        }
        existing.totalUnitsSold += item.unitsDeducted;
        existing.revenueUsd += item.subtotalUsd;
        productMap.set(cleanName, existing);
      }
    }

    const shiftId = `shift-${Date.now()}`;
    const newClosedShift: ClosedShift = {
      id: shiftId,
      eventId: activeParty.id,
      eventName: activeParty.name,
      eventDate: activeParty.date,
      eventType: activeParty.type,
      eventSubType: activeParty.eventSubType,
      openedAt: activeParty.openedAt || activeParty.date + 'T21:00:00',
      closedAt,
      bcvRate: bcvState.officialRate,
      bufferBs: exchangeBufferBs,
      effectiveRate,
      totalAttendees,
      taquillaUsd,
      barraUsd,
      totalRevenueUsd,
      totalRevenueBs,
      baseBcvRevenueUsd,
      exchangeSurplusUsd,
      exchangeSurplusBs,
      cashUsdTotal,
      zelleUsdTotal,
      pagoMovilBsTotal,
      tarjetaBsTotal,
      cogsUsd,
      productsSold: Array.from(productMap.values()),
      courtesies: partyCourtesies,
      suspendedSales,
      remainingStock: snapshotStock(products).map((rs) =>
        stripUndefined({ ...rs })
      ),
    };

    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'closedShifts', shiftId),
        stripUndefined({
          ...newClosedShift,
          staffEmails,
          createdAt: serverTimestamp(),
        })
      );
      batch.update(doc(db, 'events', activeParty.id), {
        status: 'finalizado',
        closedAt,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      // Any role (admin, taquilla, caja) sees how the party closed!
      setRecentClosedShift(newClosedShift);
    } catch (err) {
      reportError(err, OperationType.WRITE, `closedShifts/${shiftId}`);
    }
  };

  // --- Payroll Handlers (Admin Only) ---
  const handleAddPayroll = async (record: Omit<PayrollRecord, 'id'>) => {
    if (actualRole !== 'admin') return;
    const id = `pay-${Date.now()}`;
    try {
      await setDoc(
        doc(db, 'payroll', id),
        stripUndefined({
          ...record,
          id,
          adminEmails,
          createdAt: serverTimestamp(),
        })
      );
    } catch (err) {
      reportError(err, OperationType.CREATE, `payroll/${id}`);
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if (actualRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'payroll', id));
    } catch (err) {
      reportError(err, OperationType.DELETE, `payroll/${id}`);
    }
  };

  // --- Auth Gate ---
  if (authLoading || !firebaseUser || !authorizedAccount) {
    return (
      <LoginScreen
        authLoading={authLoading}
        needsEmailVerification={needsEmailVerification}
        pendingVerificationEmail={firebaseUser?.email}
        onRefreshVerification={handleRefreshVerification}
        unauthorizedEmail={
          firebaseUser && unauthorizedReason ? firebaseUser.email : null
        }
        unauthorizedReason={unauthorizedReason}
        onSignOut={handleSignOut}
      />
    );
  }

  if (dataLoading && products.length === 0 && events.length === 0) {
    return (
      <div className="min-h-screen bg-[#E2E8F0] flex flex-col items-center justify-center gap-3 text-[#0F172A]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1D4ED8]" />
        <p className="font-display font-bold text-base">
          Cargando datos de EL CANEY TAQUENSE...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E2E8F0] text-[#0F172A]">
      <SidebarAndNav
        actualRole={actualRole}
        effectiveRole={effectiveRole}
        isPrimaryAdmin={
          authorizedAccount.email.toLowerCase() ===
          primaryAdminEmail.toLowerCase()
        }
        userName={authorizedAccount.name}
        userEmail={authorizedAccount.email}
        onPreviewRoleChange={handlePreviewRoleChange}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        activeParty={activeParty}
        bcvState={bcvState}
        onRefreshBcv={refreshBcv}
        onSignOut={handleSignOut}
      />

      <main className="lg:pl-64 pb-24 lg:pb-10">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          {(activeSection === 'operacion' || effectiveRole === 'mesero') && (
            <NightOpsPanel
              role={effectiveRole}
              userEmail={authorizedAccount.email}
              userName={authorizedAccount.name}
              activeParty={activeParty}
              products={products}
              sales={sales}
              tableOrders={tableOrders}
              courtesies={courtesies}
              effectiveRate={effectiveRate}
              onRecordSale={handleRecordSale}
              onSaveTableOrder={handleSaveTableOrder}
              onRequestTableClose={handleRequestTableClose}
              onCloseTableOrder={handleCloseTableOrder}
              onCancelTableOrder={handleCancelTableOrder}
              onRecordCourtesy={handleRecordCourtesy}
              onSuspendSale={handleSuspendSale}
              onDeleteSale={handleDeleteSale}
              onCloseParty={handleCloseParty}
              onGoToCalendar={() => setActiveSection('calendario')}
            />
          )}

          {activeSection === 'calendario' && effectiveRole !== 'mesero' && (
            <EventsCalendar
              events={events}
              closedShifts={closedShifts}
              effectiveRate={effectiveRate}
              activeParty={activeParty}
              onCreateEvent={handleCreateEvent}
              onUpdateEvent={handleUpdateEvent}
              onAddRentalPayment={handleAddRentalPayment}
              onStartParty={handleStartParty}
              onGoToNightOps={() => setActiveSection('operacion')}
            />
          )}

          {activeSection === 'inventario' && effectiveRole !== 'mesero' && (
            <InventoryModule
              role={effectiveRole}
              actualRole={actualRole}
              userEmail={authorizedAccount.email}
              allowEmployeeProductEdit={allowEmployeeProductEdit}
              onToggleAllowEmployeeEdit={handleToggleAllowEmployeeEdit}
              products={products}
              restocks={restocks}
              bcvRate={bcvState.officialRate}
              effectiveRate={effectiveRate}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onRestockProduct={handleRestockProduct}
              onDeleteProduct={handleDeleteProduct}
            />
          )}

          {activeSection === 'finanzas' && effectiveRole === 'admin' && (
            <FinancePayrollModule
              bcvState={bcvState}
              exchangeBufferBs={exchangeBufferBs}
              onChangeExchangeBuffer={handleChangeExchangeBuffer}
              activeParty={activeParty}
              products={products}
              sales={sales}
              closedShifts={closedShifts}
              payroll={payroll}
              restocks={restocks}
              staffUsers={staffUsers}
              onAddPayroll={handleAddPayroll}
              onDeletePayroll={handleDeletePayroll}
            />
          )}

          {activeSection === 'configuracion' && effectiveRole === 'admin' && (
            <SettingsUsersModule
              currentUserEmail={authorizedAccount.email}
              primaryAdminEmail={primaryAdminEmail}
              staffUsers={staffUsers}
              allowEmployeeProductEdit={allowEmployeeProductEdit}
              onToggleAllowEmployeeEdit={handleToggleAllowEmployeeEdit}
              onSaveStaffUser={handleSaveStaffUser}
              onDeleteStaffUser={handleDeleteStaffUser}
              onTransferPrimaryAdmin={handleTransferPrimaryAdmin}
              onMarkUserPasswordUpdated={handleMarkUserPasswordUpdated}
              onSaveUserQuickPin={handleSaveUserQuickPin}
              previewRole={previewRole}
              onChangePreviewRole={handlePreviewRoleChange}
            />
          )}
        </div>
      </main>

      {recentClosedShift && (
        <ClosingReportModal
          shift={recentClosedShift}
          onClose={() => setRecentClosedShift(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
