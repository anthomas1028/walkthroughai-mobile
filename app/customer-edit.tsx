import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL, apiFetch } from "../lib/api";


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
  customer?: Customer;
  error?: string;
  message?: string;
};

export default function CustomerEditScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
  }>();

  const customerId = Number(params.customerId || 0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");

  const loadCustomer = useCallback(async () => {
    if (!customerId) {
      Alert.alert(
        "Customer unavailable",
        "The selected customer could not be identified."
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers/${customerId}`
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
          data.error || "Walkthrough AI couldn’t load this customer. Please try again."
        );
      }

      const customer = data.customer;

      setCompanyName(customer.company_name || "");
      setSavedCompanyName(customer.company_name || "");
      setIsArchived(Boolean(customer.is_archived));
      setShowDeleteConfirmation(false);
      setDeleteConfirmation("");
      setContactName(customer.contact_name || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setAddressLine1(customer.address_line_1 || "");
      setAddressLine2(customer.address_line_2 || "");
      setCity(customer.city || "");
      setState(customer.state || "");
      setPostalCode(customer.postal_code || "");
      setNotes(customer.notes || "");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t load this customer. Please try again.";

      Alert.alert(
        "Unable to load customer",
        `${message}\n\nCheck your internet connection and try again.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useFocusEffect(
    useCallback(() => {
      loadCustomer();
    }, [loadCustomer])
  );

  async function saveCustomer() {
    const cleanedCompanyName = companyName.trim();
    const cleanedEmail = email.trim();

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
        `${API_BASE_URL}/api/customers/${customerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_name: cleanedCompanyName,
            contact_name: contactName.trim(),
            email: cleanedEmail,
            phone: phone.trim(),
            address_line_1: addressLine1.trim(),
            address_line_2: addressLine2.trim(),
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
          data.error || "Walkthrough AI couldn’t save these customer changes. Please try again."
        );
      }

      Alert.alert(
        "Customer updated",
        `${data.customer.company_name} was updated successfully.`,
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t save these customer changes. Please try again.";

      Alert.alert(
        "Unable to update customer",
        message
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateArchiveStatus(nextArchived: boolean) {
    setIsManaging(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers/${customerId}/archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_archived: nextArchived }),
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
          data.error || "Walkthrough AI couldn’t update this customer. Please try again."
        );
      }

      Alert.alert(
        nextArchived ? "Customer archived" : "Customer restored",
        nextArchived
          ? `${data.customer.company_name} was moved to Archived Customers.`
          : `${data.customer.company_name} was restored to Active Customers.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert(
        "Unable to update customer",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsManaging(false);
    }
  }

  function confirmArchiveCustomer() {
    Alert.alert(
      "Archive customer?",
      `${savedCompanyName} will move to Archived Customers. Its walkthrough history, photos, reports, and dashboards will remain available.`,
      [
        { text: "Keep Active", style: "cancel" },
        {
          text: "Archive Customer",
          style: "destructive",
          onPress: () => {
            updateArchiveStatus(true).catch(() => undefined);
          },
        },
      ]
    );
  }

  function confirmRestoreCustomer() {
    Alert.alert(
      "Restore customer?",
      `${savedCompanyName} will return to Active Customers.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore Customer",
          onPress: () => {
            updateArchiveStatus(false).catch(() => undefined);
          },
        },
      ]
    );
  }

  async function permanentlyDeleteCustomer() {
    if (deleteConfirmation.trim() !== savedCompanyName) {
      Alert.alert(
        "Company name does not match",
        `Type ${savedCompanyName} exactly to confirm permanent deletion.`
      );
      return;
    }

    setIsManaging(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers/${customerId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmation: deleteConfirmation.trim(),
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

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Walkthrough AI couldn’t permanently delete this customer."
        );
      }

      Alert.alert(
        "Customer deleted",
        `${savedCompanyName} and its saved walkthrough records were permanently deleted.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert(
        "Unable to delete customer",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsManaging(false);
    }
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.title}>
                Edit Customer
              </Text>
              <Text style={styles.subtitle}>
                Update contact and delivery information.
              </Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                color="#3B82F6"
                size="large"
              />
              <Text style={styles.loadingText}>
                Loading customer…
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>
                    Company
                  </Text>

                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setCompanyName}
                    placeholder="Company name *"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={companyName}
                  />

                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setContactName}
                    placeholder="Contact name"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={contactName}
                  />

                  <Text style={styles.sectionTitle}>
                    Contact
                  </Text>

                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="Email address"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={email}
                  />

                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={setPhone}
                    placeholder="Phone number"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={phone}
                  />

                  <Text style={styles.sectionTitle}>
                    Address
                  </Text>

                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setAddressLine1}
                    placeholder="Address line 1"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={addressLine1}
                  />

                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setAddressLine2}
                    placeholder="Address line 2"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={addressLine2}
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

                  <Text style={styles.sectionTitle}>
                    Notes
                  </Text>

                  <TextInput
                    multiline
                    onChangeText={setNotes}
                    placeholder="Customer notes"
                    placeholderTextColor="#64748B"
                    style={[
                      styles.input,
                      styles.notesInput,
                    ]}
                    textAlignVertical="top"
                    value={notes}
                  />
                </View>

                <View style={styles.managementCard}>
                  <Text style={styles.managementTitle}>Customer Management</Text>

                  {isArchived ? (
                    <>
                      <Text style={styles.managementDescription}>
                        This customer is archived. Its walkthrough history,
                        photos, reports, and dashboards are still preserved.
                      </Text>

                      <Pressable
                        accessibilityRole="button"
                        disabled={isManaging}
                        onPress={confirmRestoreCustomer}
                        style={({ pressed }) => [
                          styles.restoreButton,
                          pressed && styles.buttonPressed,
                          isManaging && styles.buttonDisabled,
                        ]}
                      >
                        <Text style={styles.restoreButtonText}>
                          Restore Customer
                        </Text>
                      </Pressable>

                      <View style={styles.dangerDivider} />

                      <Text style={styles.dangerTitle}>Permanent deletion</Text>
                      <Text style={styles.dangerDescription}>
                        This permanently removes the customer and all saved
                        walkthrough records, results, reports, and history. It
                        cannot be undone.
                      </Text>

                      {showDeleteConfirmation ? (
                        <View style={styles.deleteConfirmationCard}>
                          <Text style={styles.deleteInstruction}>
                            Type {savedCompanyName} exactly to continue.
                          </Text>
                          <TextInput
                            autoCapitalize="none"
                            autoCorrect={false}
                            onChangeText={setDeleteConfirmation}
                            placeholder="Type company name"
                            placeholderTextColor="#64748B"
                            style={styles.deleteInput}
                            value={deleteConfirmation}
                          />

                          <View style={styles.deleteActionRow}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => {
                                setShowDeleteConfirmation(false);
                                setDeleteConfirmation("");
                              }}
                              style={({ pressed }) => [
                                styles.cancelDeleteButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                            </Pressable>

                            <Pressable
                              accessibilityRole="button"
                              disabled={
                                isManaging ||
                                deleteConfirmation.trim() !== savedCompanyName
                              }
                              onPress={permanentlyDeleteCustomer}
                              style={({ pressed }) => [
                                styles.confirmDeleteButton,
                                pressed && styles.buttonPressed,
                                (isManaging ||
                                  deleteConfirmation.trim() !== savedCompanyName) &&
                                  styles.buttonDisabled,
                              ]}
                            >
                              {isManaging ? (
                                <ActivityIndicator color="#FFFFFF" />
                              ) : (
                                <Text style={styles.confirmDeleteButtonText}>
                                  Delete Permanently
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setShowDeleteConfirmation(true)}
                          style={({ pressed }) => [
                            styles.showDeleteButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.showDeleteButtonText}>
                            Delete Permanently
                          </Text>
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.managementDescription}>
                        Archive this customer to remove it from the active list
                        without losing any walkthrough data.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isManaging}
                        onPress={confirmArchiveCustomer}
                        style={({ pressed }) => [
                          styles.archiveButton,
                          pressed && styles.buttonPressed,
                          isManaging && styles.buttonDisabled,
                        ]}
                      >
                        <Text style={styles.archiveButtonText}>Archive Customer</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </ScrollView>

              <Pressable
                accessibilityRole="button"
                disabled={isSaving || isManaging}
                onPress={saveCustomer}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.buttonPressed,
                  (isSaving || isManaging) && styles.buttonDisabled,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </>
          )}
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
    paddingTop: 14,
    paddingBottom: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#17243A",
    borderWidth: 1,
    borderColor: "#31547D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  backButtonText: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "400",
    marginTop: -3,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  formContent: {
    paddingBottom: 20,
  },

  formCard: {
    backgroundColor: "#121C2D",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
  },

  managementCard: {
    backgroundColor: "#121C2D",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
    marginTop: 14,
  },

  managementTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 8,
  },

  managementDescription: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },

  archiveButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#2A2113",
    alignItems: "center",
    justifyContent: "center",
  },

  archiveButtonText: {
    color: "#FCD34D",
    fontSize: 15,
    fontWeight: "800",
  },

  restoreButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3B82F6",
    backgroundColor: "#172B4D",
    alignItems: "center",
    justifyContent: "center",
  },

  restoreButtonText: {
    color: "#BFDBFE",
    fontSize: 15,
    fontWeight: "800",
  },

  dangerDivider: {
    height: 1,
    backgroundColor: "#3B2630",
    marginVertical: 18,
  },

  dangerTitle: {
    color: "#FCA5A5",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 7,
  },

  dangerDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 13,
  },

  showDeleteButton: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#2B151A",
    alignItems: "center",
    justifyContent: "center",
  },

  showDeleteButtonText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "800",
  },

  deleteConfirmationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#160E12",
    padding: 13,
  },

  deleteInstruction: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },

  deleteInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#0C1524",
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 13,
    marginBottom: 11,
  },

  deleteActionRow: {
    flexDirection: "row",
  },

  cancelDeleteButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  cancelDeleteButtonText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "700",
  },

  confirmDeleteButton: {
    flex: 1.45,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#B91C1C",
    alignItems: "center",
    justifyContent: "center",
  },

  confirmDeleteButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  sectionTitle: {
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 9,
  },

  input: {
    minHeight: 49,
    borderRadius: 13,
    backgroundColor: "#0C1524",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 15,
    paddingHorizontal: 14,
    marginBottom: 11,
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
    minHeight: 92,
    paddingTop: 13,
  },

  saveButton: {
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
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

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.45,
  },
});
