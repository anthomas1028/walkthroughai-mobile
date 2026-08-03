import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL, apiFetch } from "../lib/api";

import { useAuth } from "../contexts/AuthContext";


type Customer = {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerResponse = {
  success: boolean;
  customers?: Customer[];
  customer?: Customer;
  error?: string;
  message?: string;
};

export default function HomeScreen() {
  const { session, workspace } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [customerView, setCustomerView] = useState<"active" | "archived">(
    "active"
  );

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");

  const loadCustomers = useCallback(
    async (showLoadingIndicator: boolean = true) => {
      if (showLoadingIndicator) {
        setIsLoading(true);
      }

      try {
        const queryParts = [
          `archived=${customerView === "archived" ? "true" : "false"}`,
        ];

        if (searchText.trim()) {
          queryParts.push(
            `search=${encodeURIComponent(searchText.trim())}`
          );
        }

        const query = `?${queryParts.join("&")}`;

        const response = await apiFetch(
          `${API_BASE_URL}/api/customers${query}`
        );

        const responseText = await response.text();

        let data: CustomerResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "Walkthrough AI received an unexpected response. Please try again."
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Walkthrough AI couldn’t load your customers. Please try again."
          );
        }

        const loadedCustomers = data.customers || [];

        setCustomers(loadedCustomers);

        setSelectedCustomerId((currentId) => {
          if (
            currentId !== null &&
            loadedCustomers.some(
              (customer) => customer.id === currentId
            )
          ) {
            return currentId;
          }

          return null;
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Walkthrough AI couldn’t load your customers. Please try again.";

        Alert.alert(
          "Connection problem",
          `${message}\n\nCheck your internet connection and try again.`
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [customerView, searchText]
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers(false);
    }, [loadCustomers])
  );

  function resetNewCustomerForm() {
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setCity("");
    setState("");
    setPostalCode("");
    setNotes("");
  }

  function toggleNewCustomerForm() {
    setShowNewCustomerForm((currentValue) => !currentValue);
  }

  async function saveCustomer() {
    const cleanedCompanyName = companyName.trim();

    if (!cleanedCompanyName) {
      Alert.alert(
        "Company name required",
        "Enter the customer or company name before saving."
      );
      return;
    }

    setIsSaving(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_name: cleanedCompanyName,
            contact_name: contactName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            city: city.trim(),
            state: state.trim(),
            postal_code: postalCode.trim(),
            notes: notes.trim(),
          }),
        }
      );

      const responseText = await response.text();

      let data: CustomerResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Walkthrough AI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success || !data.customer) {
        throw new Error(
          data.error || "Walkthrough AI couldn’t save this customer. Please try again."
        );
      }

      const newCustomer = data.customer;

      setCustomers((currentCustomers) => {
        const updatedCustomers = [
          ...currentCustomers,
          newCustomer,
        ];

        return updatedCustomers.sort((first, second) =>
          first.company_name.localeCompare(
            second.company_name,
            undefined,
            {
              sensitivity: "base",
            }
          )
        );
      });

      setSelectedCustomerId(newCustomer.id);
      resetNewCustomerForm();
      setShowNewCustomerForm(false);

      Alert.alert(
        "Customer saved",
        `${newCustomer.company_name} was added successfully.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t save this customer. Please try again.";

      Alert.alert("Unable to save customer", message);
    } finally {
      setIsSaving(false);
    }
  }

  function startWalkthrough() {
    const selectedCustomer = customers.find(
      (customer) => customer.id === selectedCustomerId
    );

    if (!selectedCustomer) {
      Alert.alert(
        "Select a customer",
        "Choose a saved customer before starting the walkthrough."
      );
      return;
    }

    router.push({
      pathname: "/walkthrough",
      params: {
        customerId: String(selectedCustomer.id),
        customerName: selectedCustomer.company_name,
        customerEmail: selectedCustomer.email || "",
        contactName: selectedCustomer.contact_name || "",
      },
    });
  }

  function viewHistory() {
    const selectedCustomer = customers.find(
      (customer) => customer.id === selectedCustomerId
    );

    if (!selectedCustomer) {
      Alert.alert(
        "Select a customer",
        "Choose a saved customer before viewing walkthrough history."
      );
      return;
    }

    router.push({
      pathname: "/history",
      params: {
        customerId: String(selectedCustomer.id),
        customerName: selectedCustomer.company_name,
      },
    });
  }

  function editCustomer() {
    const selectedCustomer = customers.find(
      (customer) => customer.id === selectedCustomerId
    );

    if (!selectedCustomer) {
      Alert.alert(
        "Select a customer",
        "Choose a saved customer before editing customer information."
      );
      return;
    }

    router.push({
      pathname: "/customer-edit",
      params: {
        customerId: String(selectedCustomer.id),
      },
    });
  }

  function viewDashboard() {
    const selectedCustomer = customers.find(
      (customer) => customer.id === selectedCustomerId
    );

    if (!selectedCustomer) {
      Alert.alert(
        "Select a customer",
        "Choose a saved customer before viewing the customer dashboard."
      );
      return;
    }

    router.push({
      pathname: "/customer-dashboard",
      params: {
        customerId: String(selectedCustomer.id),
        customerName: selectedCustomer.company_name,
      },
    });
  }

  async function restoreCustomer(customer: Customer) {
    setIsUpdatingCustomer(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers/${customer.id}/archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_archived: false }),
        }
      );

      const responseText = await response.text();
      let data: CustomerResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Walkthrough AI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Walkthrough AI couldn’t restore this customer."
        );
      }

      setCustomers((currentCustomers) =>
        currentCustomers.filter((item) => item.id !== customer.id)
      );
      setSelectedCustomerId(null);

      Alert.alert(
        "Customer restored",
        `${customer.company_name} is active again.`
      );
    } catch (error) {
      Alert.alert(
        "Unable to restore customer",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsUpdatingCustomer(false);
    }
  }

  function confirmRestoreCustomer() {
    if (!selectedCustomer) {
      return;
    }

    Alert.alert(
      "Restore customer?",
      `${selectedCustomer.company_name} will return to your active customer list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => restoreCustomer(selectedCustomer),
        },
      ]
    );
  }

  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedCustomerId
  );

  function renderCustomer({
    item,
  }: {
    item: Customer;
  }) {
    const isSelected = item.id === selectedCustomerId;

    const location = [item.city, item.state]
      .filter(Boolean)
      .join(", ");

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={
          isSelected
            ? `${item.company_name}, selected. Tap to clear selection.`
            : `Select ${item.company_name}`
        }
        onPress={() =>
          setSelectedCustomerId((currentId) =>
            currentId === item.id ? null : item.id
          )
        }
        style={({ pressed }) => [
          styles.customerCard,
          isSelected && styles.customerCardSelected,
          pressed && styles.customerCardPressed,
        ]}
      >
        <View style={styles.customerSelectionRow}>
          <View
            style={[
              styles.radioOuter,
              isSelected && styles.radioOuterSelected,
            ]}
          >
            {isSelected ? (
              <View style={styles.radioInner} />
            ) : null}
          </View>

          <View style={styles.customerInformation}>
            <Text style={styles.customerCompany}>
              {item.company_name}
            </Text>

            {item.contact_name ? (
              <Text style={styles.customerDetail}>
                {item.contact_name}
              </Text>
            ) : null}

            {item.email ? (
              <Text style={styles.customerDetail}>
                {item.email}
              </Text>
            ) : null}

            {location ? (
              <Text style={styles.customerLocation}>
                {location}
              </Text>
            ) : null}

            {item.is_archived ? (
              <Text style={styles.archivedBadge}>Archived</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={
          Platform.OS === "ios" ? "padding" : undefined
        }
        style={styles.keyboardView}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.title}>Walkthrough AI</Text>
              <Text style={styles.subtitle}>
                {workspace?.name || "Your private workspace"}
              </Text>
              <Text style={styles.accountEmail}>{session?.user.email || ""}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/account")}
              style={({ pressed }) => [
                styles.accountButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.accountButtonText}>Account</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Customers</Text>

            {customerView === "active" || showNewCustomerForm ? (
              <Pressable
                accessibilityRole="button"
                onPress={toggleNewCustomerForm}
                style={({ pressed }) => [
                  styles.addCustomerButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.addCustomerButtonText}>
                  {showNewCustomerForm ? "Cancel" : "+ Add"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {showNewCustomerForm ? (
            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.formScrollContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>
                  New customer
                </Text>

                <TextInput
                  autoCapitalize="words"
                  onChangeText={setCompanyName}
                  placeholder="Company name *"
                  placeholderTextColor="#64748B"
                  returnKeyType="next"
                  style={styles.input}
                  value={companyName}
                />

                <TextInput
                  autoCapitalize="words"
                  onChangeText={setContactName}
                  placeholder="Contact name"
                  placeholderTextColor="#64748B"
                  returnKeyType="next"
                  style={styles.input}
                  value={contactName}
                />

                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="#64748B"
                  returnKeyType="next"
                  style={styles.input}
                  value={email}
                />

                <TextInput
                  keyboardType="phone-pad"
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor="#64748B"
                  returnKeyType="done"
                  style={styles.input}
                  value={phone}
                />

                <View style={styles.addressRow}>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor="#64748B"
                    style={[
                      styles.input,
                      styles.cityInput,
                    ]}
                    value={city}
                  />

                  <TextInput
                    autoCapitalize="characters"
                    maxLength={2}
                    onChangeText={setState}
                    placeholder="State"
                    placeholderTextColor="#64748B"
                    style={[
                      styles.input,
                      styles.stateInput,
                    ]}
                    value={state}
                  />

                  <TextInput
                    keyboardType="number-pad"
                    maxLength={10}
                    onChangeText={setPostalCode}
                    placeholder="ZIP"
                    placeholderTextColor="#64748B"
                    style={[
                      styles.input,
                      styles.postalCodeInput,
                    ]}
                    value={postalCode}
                  />
                </View>

                <TextInput
                  blurOnSubmit={false}
                  multiline
                  onChangeText={setNotes}
                  placeholder="Customer notes"
                  placeholderTextColor="#64748B"
                  scrollEnabled
                  style={[
                    styles.input,
                    styles.notesInput,
                  ]}
                  textAlignVertical="top"
                  value={notes}
                />

                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={saveCustomer}
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    isSaving && styles.buttonDisabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Save Customer
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.customerViewTabs}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: customerView === "active" }}
                  onPress={() => {
                    setSelectedCustomerId(null);
                    setCustomerView("active");
                  }}
                  style={[
                    styles.customerViewTab,
                    customerView === "active" && styles.customerViewTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.customerViewTabText,
                      customerView === "active" &&
                        styles.customerViewTabTextSelected,
                    ]}
                  >
                    Active
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: customerView === "archived" }}
                  onPress={() => {
                    setSelectedCustomerId(null);
                    setCustomerView("archived");
                  }}
                  style={[
                    styles.customerViewTab,
                    styles.customerViewTabLast,
                    customerView === "archived" && styles.customerViewTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.customerViewTabText,
                      customerView === "archived" &&
                        styles.customerViewTabTextSelected,
                    ]}
                  >
                    Archived
                  </Text>
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setSearchText}
                  onSubmitEditing={() =>
                    loadCustomers()
                  }
                  placeholder="Search customers"
                  placeholderTextColor="#64748B"
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={searchText}
                />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => loadCustomers()}
                  style={({ pressed }) => [
                    styles.searchButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.searchButtonText}>
                    Search
                  </Text>
                </Pressable>
              </View>

              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator
                    color="#3B82F6"
                    size="large"
                  />
                  <Text style={styles.loadingText}>
                    Loading customers…
                  </Text>
                </View>
              ) : (
                <FlatList
                  contentContainerStyle={
                    customers.length === 0
                      ? styles.emptyList
                      : styles.customerList
                  }
                  data={customers}
                  keyExtractor={(item) =>
                    String(item.id)
                  }
                  keyboardShouldPersistTaps="handled"
                  refreshControl={
                    <RefreshControl
                      onRefresh={() => {
                        setIsRefreshing(true);
                        loadCustomers(false);
                      }}
                      refreshing={isRefreshing}
                      tintColor="#3B82F6"
                    />
                  }
                  renderItem={renderCustomer}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyIcon}>
                        👤
                      </Text>

                      <Text style={styles.emptyTitle}>
                        {customerView === "archived"
                          ? "No archived customers"
                          : "No customers found"}
                      </Text>

                      <Text style={styles.emptyDescription}>
                        {customerView === "archived"
                          ? "Customers you archive will appear here."
                          : "Add your first customer or change the search."}
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          )}

          {!showNewCustomerForm ? (
            <View style={styles.bottomArea}>
              {selectedCustomer ? (
                <>
                  <View style={styles.selectedCustomerRow}>
                    <View style={styles.selectedCustomerTextArea}>
                      <Text style={styles.selectedCustomerLabel}>
                        {customerView === "archived"
                          ? "ARCHIVED CUSTOMER"
                          : "SELECTED CUSTOMER"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.selectedCustomerName}
                      >
                        {selectedCustomer.company_name}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear selected customer"
                      onPress={() => setSelectedCustomerId(null)}
                      style={({ pressed }) => [
                        styles.clearSelectionButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.clearSelectionButtonText}>
                        Clear
                      </Text>
                    </Pressable>
                  </View>

                  {customerView === "active" ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={startWalkthrough}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>
                        Start Walkthrough
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingCustomer}
                      onPress={confirmRestoreCustomer}
                      style={({ pressed }) => [
                        styles.restoreButton,
                        pressed && styles.buttonPressed,
                        isUpdatingCustomer && styles.buttonDisabled,
                      ]}
                    >
                      {isUpdatingCustomer ? (
                        <ActivityIndicator color="#BFDBFE" />
                      ) : (
                        <Text style={styles.restoreButtonText}>
                          Restore Customer
                        </Text>
                      )}
                    </Pressable>
                  )}

                  <View style={styles.customerActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={viewDashboard}
                      style={({ pressed }) => [
                        styles.compactActionButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.compactActionButtonText}>
                        Dashboard
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={viewHistory}
                      style={({ pressed }) => [
                        styles.compactActionButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.compactActionButtonText}>
                        History
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={editCustomer}
                      style={({ pressed }) => [
                        styles.compactActionButton,
                        styles.compactActionButtonLast,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.compactActionButtonText}>
                        {customerView === "archived" ? "Manage" : "Edit"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.noSelectionCard}>
                  <Text style={styles.noSelectionTitle}>
                    No customer selected
                  </Text>
                  <Text style={styles.noSelectionText}>
                    Tap a customer above to see walkthrough actions.
                  </Text>
                </View>
              )}

              <Text style={styles.versionText}>
                Version 0.1.0
              </Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1220",
  },

  keyboardView: {
    flex: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  logoContainer: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    marginRight: 14,
  },

  logoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.6,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  accountEmail: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },

  accountButton: {
    borderColor: "#334E70",
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  accountButtonText: {
    color: "#A7C7F2",
    fontSize: 12,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },

  addCustomerButton: {
    minWidth: 74,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1E3A5F",
    borderWidth: 1,
    borderColor: "#31547D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },

  addCustomerButtonText: {
    color: "#93C5FD",
    fontSize: 14,
    fontWeight: "800",
  },

  searchRow: {
    flexDirection: "row",
    marginBottom: 13,
  },

  customerViewTabs: {
    flexDirection: "row",
    padding: 4,
    marginBottom: 11,
    borderRadius: 13,
    backgroundColor: "#101A2A",
    borderWidth: 1,
    borderColor: "#26364F",
  },

  customerViewTab: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    marginRight: 4,
  },

  customerViewTabLast: {
    marginRight: 0,
  },

  customerViewTabSelected: {
    backgroundColor: "#1E3A5F",
  },

  customerViewTabText: {
    color: "#718096",
    fontSize: 13,
    fontWeight: "800",
  },

  customerViewTabTextSelected: {
    color: "#BFDBFE",
  },

  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#121C2D",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 15,
    paddingHorizontal: 15,
    marginRight: 9,
  },

  searchButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  customerList: {
    paddingBottom: 14,
  },

  customerCard: {
    backgroundColor: "#121C2D",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#22314A",
    padding: 16,
    marginBottom: 10,
  },

  customerCardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#14243A",
  },

  customerCardPressed: {
    opacity: 0.82,
  },

  customerSelectionRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  radioOuter: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#64748B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  radioOuterSelected: {
    borderColor: "#3B82F6",
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#3B82F6",
  },

  customerInformation: {
    flex: 1,
  },

  customerCompany: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 3,
  },

  customerDetail: {
    color: "#AAB7CA",
    fontSize: 13,
    lineHeight: 19,
  },

  customerLocation: {
    color: "#718096",
    fontSize: 12,
    marginTop: 4,
  },

  archivedBadge: {
    alignSelf: "flex-start",
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 7,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 12,
  },

  emptyList: {
    flexGrow: 1,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 50,
  },

  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  emptyDescription: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    marginTop: 7,
  },

  formScrollContent: {
    paddingBottom: 260,
  },

  formCard: {
    backgroundColor: "#121C2D",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
  },

  formTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 13,
  },

  input: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#0C1524",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 15,
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  addressRow: {
    flexDirection: "row",
  },

  cityInput: {
    flex: 1,
    marginRight: 8,
  },

  stateInput: {
    width: 70,
    marginRight: 8,
    textAlign: "center",
  },

  postalCodeInput: {
    width: 90,
  },

  notesInput: {
    minHeight: 130,
    paddingTop: 13,
    paddingBottom: 13,
  },

  saveButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  bottomArea: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#22314A",
    paddingTop: 10,
  },

  selectedCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },

  selectedCustomerTextArea: {
    flex: 1,
    paddingRight: 12,
  },

  selectedCustomerLabel: {
    color: "#6F8CAD",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  selectedCustomerName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },

  clearSelectionButton: {
    minWidth: 58,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#31547D",
    backgroundColor: "#17243A",
  },

  clearSelectionButtonText: {
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: "900",
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  restoreButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3B82F6",
    backgroundColor: "#17243A",
    alignItems: "center",
    justifyContent: "center",
  },

  restoreButtonText: {
    color: "#BFDBFE",
    fontSize: 16,
    fontWeight: "900",
  },

  customerActionRow: {
    flexDirection: "row",
    marginTop: 8,
  },

  compactActionButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#31547D",
    backgroundColor: "#17243A",
    marginRight: 7,
  },

  compactActionButtonLast: {
    marginRight: 0,
  },

  compactActionButtonText: {
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: "900",
  },

  noSelectionCard: {
    minHeight: 62,
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#26364F",
    backgroundColor: "#101A2A",
    paddingHorizontal: 15,
  },

  noSelectionTitle: {
    color: "#D4DEEA",
    fontSize: 13,
    fontWeight: "900",
  },

  noSelectionText: {
    color: "#718096",
    fontSize: 11,
    marginTop: 3,
  },

  versionText: {
    color: "#52647A",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.4,
  },
});
