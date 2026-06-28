import SwiftUI

struct DesktopLoginView: View {
    let onSubmit: (String) async -> Void

    @State private var inviteCode = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "key.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("Welcome to QRClaw")
                .font(.title)

            Text("Enter the invite code from your team to get started.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("Invite code", text: $inviteCode)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 320)

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.callout)
            }

            Button(isSubmitting ? "Signing in…" : "Continue") {
                Task {
                    isSubmitting = true
                    errorMessage = nil
                    await onSubmit(inviteCode)
                    isSubmitting = false
                }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(inviteCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
        }
        .padding(48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
    }
}
